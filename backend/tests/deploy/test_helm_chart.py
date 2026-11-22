"""Helm chart checks (NEX-120): lint, schema, pod hardening, NetworkPolicy, and Compose image parity."""

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[3]
CHART = REPO / "deploy" / "helm" / "nexuscampus"
COMPOSE = REPO / "deploy" / "compose" / "compose.yaml"

SECRET_ENV_VARS = {
    "NEXUS_DB_PASSWORD",
    "NEXUS_APP_DB_PASSWORD",
    "NEXUS_OIDC_CLIENT_SECRET",
    "NEXUS_GRANT_SIGNING_KEY",
    "NEXUS_VAULT_TOKEN",
    "NEXUS_ANTHROPIC_API_KEY",
    "NEXUS_CONTROL_AGENT_TOKEN",
    "POSTGRES_PASSWORD",
    "KEYCLOAK_DB_PASSWORD",
    "KC_BOOTSTRAP_ADMIN_PASSWORD",
}


def _find_helm() -> str | None:
    if found := shutil.which("helm"):
        return found
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    for candidate in (
        local / "Microsoft" / "WinGet" / "Links" / "helm.exe",
        *local.glob("Microsoft/WinGet/Packages/Helm.Helm_*/windows-amd64/helm.exe"),
    ):
        if candidate.is_file():
            return str(candidate)
    return None


HELM = _find_helm()
pytestmark = pytest.mark.skipif(HELM is None, reason="helm binary not installed")


def _run_helm(*args: str) -> subprocess.CompletedProcess[str]:
    assert HELM is not None
    return subprocess.run([HELM, *args], capture_output=True, text=True, check=False)  # noqa: S603


def _scalar(raw: str) -> Any:
    s = raw.strip()
    if s in ("null", "~", ""):
        return None
    if s in ("true", "false"):
        return s == "true"
    if s in ("{}", "[]"):
        return {} if s == "{}" else []
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        return s[1:-1]
    return int(s) if re.fullmatch(r"-?\d+", s) else s


def _parse_yaml_block(lines: list[tuple[int, str]], idx: int, indent: int) -> tuple[Any, int]:
    """Minimal indent-aware YAML parser for Helm-rendered Kubernetes manifests (stdlib only)."""
    if lines[idx][1].startswith("- ") or lines[idx][1] == "-":
        items: list[Any] = []
        while idx < len(lines) and lines[idx][0] == indent and (lines[idx][1].startswith("- ") or lines[idx][1] == "-"):
            rest = lines[idx][1][2:].strip() if lines[idx][1].startswith("- ") else ""
            idx += 1
            if not rest:
                val, idx = (
                    _parse_yaml_block(lines, idx, lines[idx][0])
                    if idx < len(lines) and lines[idx][0] > indent
                    else (None, idx)
                )
                items.append(val)
                continue
            if ":" in rest and not rest.startswith(("'", '"')):
                k, _, v = rest.partition(":")
                item: dict[str, Any] = {}
                v_s = v.strip()
                if v_s in ("|", "|-", ">", ">-"):
                    block: list[str] = []
                    while idx < len(lines) and lines[idx][0] > indent + 2:
                        block.append(lines[idx][1])
                        idx += 1
                    item[k.strip()] = "\n".join(block)
                elif v_s:
                    item[k.strip()] = _scalar(v_s)
                elif idx < len(lines) and lines[idx][0] > indent + 2:
                    item[k.strip()], idx = _parse_yaml_block(lines, idx, lines[idx][0])
                else:
                    item[k.strip()] = None
                if idx < len(lines) and lines[idx][0] == indent + 2 and not lines[idx][1].startswith("- "):
                    extra, idx = _parse_yaml_block(lines, idx, indent + 2)
                    if isinstance(extra, dict):
                        item.update(extra)
                items.append(item)
            else:
                items.append(_scalar(rest))
        return items, idx

    mapping: dict[str, Any] = {}
    while idx < len(lines) and lines[idx][0] == indent and not lines[idx][1].startswith("- "):
        k, _, v = lines[idx][1].partition(":")
        key, v_s, idx = str(_scalar(k.strip())), v.strip(), idx + 1
        if v_s in ("|", "|-", ">", ">-"):
            block = []
            while idx < len(lines) and lines[idx][0] > indent:
                block.append(lines[idx][1])
                idx += 1
            mapping[key] = "\n".join(block)
        elif v_s:
            mapping[key] = _scalar(v_s)
        elif idx < len(lines) and lines[idx][0] > indent:
            mapping[key], idx = _parse_yaml_block(lines, idx, lines[idx][0])
        else:
            mapping[key] = None
    return mapping, idx


def _load_k8s_docs(rendered: str) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for raw_doc in re.split(r"(?m)^---\s*$", rendered):
        lines: list[tuple[int, str]] = []
        for line in raw_doc.splitlines():
            stripped = line.lstrip(" ")
            if not stripped or stripped.startswith("#"):
                continue
            lines.append((len(line) - len(stripped), stripped))
        if not lines:
            continue
        parsed, _ = _parse_yaml_block(lines, 0, lines[0][0])
        if isinstance(parsed, dict) and "kind" in parsed:
            docs.append(parsed)
    return docs


def _compose_images() -> dict[str, str]:
    out: dict[str, str] = {}
    service: str | None = None
    for line in COMPOSE.read_text(encoding="utf-8").splitlines():
        if m := re.match(r"^  ([a-z0-9_-]+):\s*$", line):
            service = m.group(1)
        elif service and (m := re.match(r"^\s+image:\s+(.+?)\s*$", line)):
            raw = m.group(1).strip()
            # Resolve ${NEXUS_IMAGE_API:-nexuscampus-api:dev} -> nexuscampus-api:dev
            if dm := re.match(r"^\$\{[^:}]+:-([^}]+)\}$", raw):
                raw = dm.group(1)
            out[service] = raw
    return out


def _pod_spec(doc: dict[str, Any]) -> dict[str, Any] | None:
    if doc.get("kind") in ("Deployment", "StatefulSet", "Job"):
        return doc["spec"]["template"]["spec"]  # type: ignore[no-any-return]
    return None


def test_helm_lint_and_schema_rejects_unknown_keys_and_plaintext_secrets(tmp_path: Path) -> None:
    lint = _run_helm("lint", str(CHART))
    assert lint.returncode == 0, lint.stdout + lint.stderr

    # No external chart dependencies.
    chart_text = (CHART / "Chart.yaml").read_text(encoding="utf-8")
    assert "dependencies:" not in chart_text

    # Unknown top-level key rejected by values.schema.json.
    bad_unknown = tmp_path / "unknown.yaml"
    bad_unknown.write_text("unexpectedOption: true\n", encoding="utf-8")
    r_unk = _run_helm("template", "rel", str(CHART), "-f", str(bad_unknown))
    assert r_unk.returncode != 0

    # Plain-text secret keys rejected by values.schema.json.
    for bad_yaml in ("secrets:\n  password: plain\n", "db:\n  password: plain\n", "api:\n  vaultToken: s.abc\n"):
        f = tmp_path / "bad_secret.yaml"
        f.write_text(bad_yaml, encoding="utf-8")
        res = _run_helm("template", "rel", str(CHART), "-f", str(f))
        assert res.returncode != 0, bad_yaml


def test_default_render_pod_security_network_policies_and_compose_image_parity() -> None:
    res = _run_helm("template", "campus", str(CHART))
    assert res.returncode == 0, res.stderr
    docs = _load_k8s_docs(res.stdout)

    workloads = [d for d in docs if _pod_spec(d) is not None]
    comps = {d["metadata"]["labels"]["app.kubernetes.io/component"]: d for d in workloads}
    assert set(comps) == {"api", "worker", "web", "migrate", "db", "valkey", "openbao", "keycloak"}

    # Migrate job is a forward-only pre-install / pre-upgrade hook.
    mig_ann = comps["migrate"]["metadata"]["annotations"]
    assert mig_ann["helm.sh/hook"] == "pre-install,pre-upgrade"

    # Every rendered pod meets step 3 hardening rules & no plain secrets in env.
    for comp, doc in comps.items():
        pod = _pod_spec(doc)
        assert pod is not None
        assert pod.get("automountServiceAccountToken") is False, comp
        assert not pod.get("hostNetwork"), comp
        assert not pod.get("hostPID"), comp
        assert not pod.get("hostIPC"), comp
        for vol in pod.get("volumes") or []:
            assert "hostPath" not in vol, comp
        psc = pod.get("securityContext") or {}
        assert psc.get("runAsNonRoot") is True, comp
        assert (psc.get("seccompProfile") or {}).get("type") == "RuntimeDefault", comp

        for c in pod["containers"]:
            csc = c.get("securityContext") or {}
            assert csc.get("allowPrivilegeEscalation") is False, comp
            assert csc.get("runAsNonRoot") is True, comp
            assert (csc.get("capabilities") or {}).get("drop") == ["ALL"], comp
            if comp != "keycloak":
                assert csc.get("readOnlyRootFilesystem") is True, comp
            resources = c.get("resources") or {}
            assert resources.get("requests") and resources.get("limits"), comp
            if comp != "migrate":
                assert c.get("livenessProbe") and c.get("readinessProbe"), comp
            for env in c.get("env") or []:
                if env["name"] in SECRET_ENV_VARS:
                    assert "value" not in env and "secretKeyRef" in (env.get("valueFrom") or {}), (comp, env["name"])

    # Every rendered image matches deploy/compose/compose.yaml verbatim (including sha256 digests).
    compose_imgs = _compose_images()
    mapping = {
        "api": compose_imgs["api"],
        "worker": compose_imgs["worker"],
        "migrate": compose_imgs["migrate"],
        "web": compose_imgs["web"],
        "db": compose_imgs["db"],
        "valkey": compose_imgs["redis"],
        "openbao": compose_imgs["vault"],
        "keycloak": compose_imgs["keycloak"],
    }
    for comp, expected_img in mapping.items():
        pod = _pod_spec(comps[comp])
        assert pod is not None
        assert pod["containers"][0]["image"] == expected_img, comp

    # NetworkPolicies: default-deny + web -> api + backing services; no outbound 443 when control.url is empty.
    netpols = {d["metadata"]["name"]: d for d in docs if d.get("kind") == "NetworkPolicy"}
    dd = netpols["campus-nexuscampus-default-deny"]["spec"]
    assert dd["policyTypes"] == ["Ingress", "Egress"]
    assert "ingress" not in dd and "egress" not in dd
    web_egress = netpols["campus-nexuscampus-web"]["spec"]["egress"]
    assert web_egress[0]["ports"][0]["port"] == 8000
    assert web_egress[0]["to"][0]["podSelector"]["matchLabels"]["app.kubernetes.io/component"] == "api"
    api_ports = [p["port"] for rule in netpols["campus-nexuscampus-api"]["spec"]["egress"] for p in rule["ports"]]
    assert {5432, 6379, 8200, 8080} <= set(api_ports)
    assert 443 not in api_ports


def test_external_services_ingress_and_air_gapped_control_egress(tmp_path: Path) -> None:
    ext = tmp_path / "external.yaml"
    ext.write_text(
        "db:\n  enabled: false\n  external:\n    host: pg.internal.example\n"
        "valkey:\n  enabled: false\n  external:\n    host: valkey.internal.example\n"
        "openbao:\n  enabled: false\n  external:\n    url: https://openbao.internal.example\n"
        "keycloak:\n  enabled: false\n  external:\n    url: https://sso.internal.example\n"
        "control:\n  url: https://control.nexuscampus.example\n  airGapped: false\n"
        "ingress:\n  enabled: true\n  tlsSecretName: campus-tls\n",
        encoding="utf-8",
    )
    res = _run_helm("template", "campus", str(CHART), "-f", str(ext))
    assert res.returncode == 0, res.stderr
    docs = _load_k8s_docs(res.stdout)
    workloads = {d["metadata"]["labels"]["app.kubernetes.io/component"] for d in docs if _pod_spec(d) is not None}
    assert workloads == {"api", "worker", "web", "migrate"}

    # Ingress uses the named TLS Secret.
    ing = next(d for d in docs if d.get("kind") == "Ingress")
    assert ing["spec"]["tls"][0]["secretName"] == "campus-tls"

    # Control URL enabled & not air-gapped -> outbound 443 allowed for api & worker.
    netpols = {d["metadata"]["name"]: d for d in docs if d.get("kind") == "NetworkPolicy"}
    api_ports = [p["port"] for rule in netpols["campus-nexuscampus-api"]["spec"]["egress"] for p in rule["ports"]]
    assert 443 in api_ports

    # Air-gapped=true -> outbound 443 removed even if control.url is set.
    res_air = _run_helm("template", "campus", str(CHART), "-f", str(ext), "--set", "control.airGapped=true")
    assert res_air.returncode == 0, res_air.stderr
    air_netpols = {d["metadata"]["name"]: d for d in _load_k8s_docs(res_air.stdout) if d.get("kind") == "NetworkPolicy"}
    air_ports = [p["port"] for rule in air_netpols["campus-nexuscampus-api"]["spec"]["egress"] for p in rule["ports"]]
    assert 443 not in air_ports
