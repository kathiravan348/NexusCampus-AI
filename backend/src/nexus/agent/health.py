"""PII-free health measurements and outbound check-in to Nexus Control (M84, NEX-114).

Sends only counts, rates and timings matching Control's `HealthSignal` without `deploymentId`.
Never runs when `air_gapped` is on, `telemetry_enabled` is off, or no agent token is configured (V-4, V-6, V-7).
Never prints or logs the bearer token, URL query strings, or any personal data.
"""

import math
import shutil
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx2
from sqlalchemy import Connection, text

from nexus.settings import Settings

PROBE_TIMEOUT_SECONDS = 5.0
REPORT_TIMEOUT_SECONDS = 10.0
ACTIVE_USER_WINDOW = timedelta(minutes=15)
HEALTH_ENDPOINT_PATH = "/control/api/v1/agent/health"
LOOPBACK_HOSTS = ("localhost", "127.0.0.1", "::1")


@dataclass(frozen=True)
class ProbeSummary:
    uptime_pct: float
    error_rate_pct: float
    p95_latency_ms: int


@dataclass(frozen=True)
class ReportResult:
    sent: bool
    message: str


def _clamp_pct(value: float) -> float:
    return float(round(min(100.0, max(0.0, value)), 2))


def _p95_ms(samples_ms: list[float]) -> int:
    if not samples_ms:
        return 0
    ordered = sorted(samples_ms)
    index = min(len(ordered) - 1, max(0, math.ceil(0.95 * len(ordered)) - 1))
    return max(0, round(ordered[index]))


def _disk_used_pct(install_dir: Path) -> float:
    target = install_dir
    while not target.exists() and target != target.parent:
        target = target.parent
    usage = shutil.disk_usage(target)
    if usage.total <= 0:
        return 0.0
    return _clamp_pct((usage.used / usage.total) * 100.0)


def _control_health_url(base_url: str) -> str | None:
    parts = urlsplit(base_url.strip())
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    # The bearer token never travels unencrypted: plain http only to a Control on this machine (development).
    if parts.scheme == "http" and parts.hostname not in LOOPBACK_HOSTS:
        return None
    path = parts.path.rstrip("/") + HEALTH_ENDPOINT_PATH
    # Drop any query string or fragment so nothing extra is sent or logged.
    return urlunsplit((parts.scheme, parts.netloc, path, "", ""))


def report_skip_reason(settings: Settings) -> str | None:
    """Returns a one-line reason when health reporting is off or unpaired, else None."""
    if settings.air_gapped:
        return "skipped: air-gapped install"
    if not settings.telemetry_enabled:
        return "skipped: telemetry is off"
    if not settings.control_agent_token.get_secret_value().strip():
        return "skipped: no agent token configured"
    return None


def probe_api(
    url: str,
    probes: int,
    *,
    transport: httpx2.BaseTransport | None = None,
) -> ProbeSummary:
    """Runs `probes` GETs to `url` (5 s timeout each) and computes uptime, error rate and p95 latency."""
    sent = max(1, probes)
    answered_ms: list[float] = []
    errors = 0
    client = (
        httpx2.Client(timeout=PROBE_TIMEOUT_SECONDS, transport=transport)
        if transport is not None
        else httpx2.Client(timeout=PROBE_TIMEOUT_SECONDS)
    )
    with client:
        for _ in range(sent):
            started = time.perf_counter()
            try:
                response = client.get(url)
            except httpx2.HTTPError:
                errors += 1
                continue
            elapsed_ms = max(0.0, (time.perf_counter() - started) * 1000.0)
            answered_ms.append(elapsed_ms)
            if response.status_code >= 500:
                errors += 1
    return ProbeSummary(
        uptime_pct=_clamp_pct((len(answered_ms) / sent) * 100.0),
        error_rate_pct=_clamp_pct((errors / sent) * 100.0),
        p95_latency_ms=_p95_ms(answered_ms),
    )


def measure_health(
    conn: Connection,
    settings: Settings,
    *,
    now: datetime | None = None,
    probe_transport: httpx2.BaseTransport | None = None,
) -> dict[str, Any]:
    """Collects a PII-free health report matching Control's `HealthSignal` minus `deploymentId`."""
    current = (now or datetime.now(UTC)).astimezone(UTC)
    probe = probe_api(settings.agent_probe_url, settings.agent_probes, transport=probe_transport)
    disk_pct = _disk_used_pct(settings.install_dir)
    queue_depth = max(
        0,
        int(
            conn.execute(
                text(
                    "SELECT"
                    " (SELECT count(*) FROM install_backups WHERE status = 'running')"
                    " + (SELECT count(*) FROM install_diagnostics WHERE status = 'generating')"
                )
            ).scalar_one()
        ),
    )
    active_users = max(
        0,
        int(
            conn.execute(
                text("SELECT nexus_install_active_users(:since)"),
                {"since": current - ACTIVE_USER_WINDOW},
            ).scalar_one()
        ),
    )
    return {
        "at": current.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "version": settings.app_version,
        "uptimePct": probe.uptime_pct,
        "errorRatePct": probe.error_rate_pct,
        "p95LatencyMs": probe.p95_latency_ms,
        "queueDepth": queue_depth,
        "diskUsedPct": disk_pct,
        "activeUsers": active_users,
    }


def send_report(
    conn: Connection | None,
    settings: Settings,
    *,
    now: datetime | None = None,
    probe_transport: httpx2.BaseTransport | None = None,
    control_transport: httpx2.BaseTransport | None = None,
) -> ReportResult:
    """Measures health and sends one check-in to Control. Reports errors on one line without raising."""
    skip = report_skip_reason(settings)
    if skip is not None:
        return ReportResult(sent=False, message=skip)
    endpoint = _control_health_url(settings.control_url)
    if endpoint is None:
        return ReportResult(
            sent=False, message="failed: invalid control URL (https required, http only on this machine)"
        )
    if conn is None:
        return ReportResult(sent=False, message="failed: no database connection")

    payload = measure_health(conn, settings, now=now, probe_transport=probe_transport)
    token = settings.control_agent_token.get_secret_value().strip()
    client = (
        httpx2.Client(timeout=REPORT_TIMEOUT_SECONDS, verify=True, transport=control_transport)
        if control_transport is not None
        else httpx2.Client(timeout=REPORT_TIMEOUT_SECONDS, verify=True)
    )
    try:
        with client:
            response = client.post(
                endpoint,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx2.TimeoutException:
        return ReportResult(sent=False, message="failed: control timed out")
    except httpx2.ConnectError:
        return ReportResult(sent=False, message="failed: could not reach control")
    except httpx2.HTTPError as exc:
        return ReportResult(sent=False, message=f"failed: network error ({type(exc).__name__})")

    status = response.status_code
    if status == 204:
        return ReportResult(sent=True, message="sent")
    if status == 401:
        return ReportResult(sent=False, message="rejected (401): agent token invalid or revoked")
    if status == 403:
        return ReportResult(sent=False, message="rejected (403): deployment is air-gapped on Control")
    if status == 429:
        return ReportResult(sent=False, message="rate limited (429): wait 60s before next report")
    if status == 413:
        return ReportResult(sent=False, message="rejected (413): health report too large")
    if status == 422:
        return ReportResult(sent=False, message="rejected (422): health report rejected by Control")
    return ReportResult(sent=False, message=f"failed: control answered HTTP {status}")
