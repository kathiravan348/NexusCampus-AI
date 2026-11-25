"""Database-backed tests for M08 wire contracts, authorization, audit and isolation."""

from collections.abc import Iterator
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import CheckConstraint, Engine, UniqueConstraint, create_engine, inspect, text

from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m08.models import CustomFieldDefinition, FormDefinition, NumberingFormat, WorkflowDefinition
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

API = "/api/v1/"
FIELDS = API + "custom-fields"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
FIELD: dict[str, object] = {
    "entity": "learner",
    "key": "m08Answer",
    "type": "text",
    "required": False,
    "sensitive": True,
    "order": 0,
}
STEP = {"id": "step1", "approverRoleId": "role1", "slaHours": None, "escalateToRoleId": None}
STAMPED = {"id", "tenantId", "createdAt", "updatedAt"}
SHAPES = {
    "custom-fields": STAMPED | {*FIELD, "label", "archived"},
    "forms": STAMPED | {"entity", "name", "fieldKeys", "public", "published"},
    "workflows": STAMPED | {"subject", "name", "steps", "active"},
    "numbering-formats": {"id", "tenantId", "updatedAt", "subject", "pattern", "resetsYearly", "nextSequence"},
}
MODELS = (CustomFieldDefinition, FormDefinition, WorkflowDefinition, NumberingFormat)


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


@pytest.fixture
def config_db(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        for slug in ("ls", "rv"):
            base = {"tenant_id": f"ten-{slug}", "id": f"m08-{slug}"}
            field = Base.metadata.tables["custom_field_definitions"].insert()
            conn.execute(field, {**base, **FIELD, "label": {"en": "Answer"}, "archived": True})
            conn.execute(
                field,
                {
                    **base,
                    **FIELD,
                    "id": f"m08-{slug}-two",
                    "entity": "guardian",
                    "label": {"en": "Two"},
                    "archived": False,
                },
            )
            conn.execute(
                Base.metadata.tables["form_definitions"].insert(),
                {
                    **base,
                    "entity": "learner",
                    "name": "Form",
                    "field_keys": [FIELD["key"]],
                    "public": False,
                    "published": True,
                },
            )
            conn.execute(
                Base.metadata.tables["workflow_definitions"].insert(),
                {**base, "subject": "record_change", "name": "Workflow", "steps": [STEP], "active": True},
            )
            conn.execute(
                Base.metadata.tables["numbering_formats"].insert(),
                {**base, "subject": "invoice", "pattern": "{YY}/{SEQ:4}", "resets_yearly": True, "next_sequence": 1},
            )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            for model in MODELS:
                table = Base.metadata.tables[str(model.__tablename__)]
                conn.execute(table.delete().where(table.c.id.in_(["m08-ls", "m08-ls-two", "m08-rv", "m08-rv-two"])))
            conn.execute(
                text(
                    "DELETE FROM custom_field_definitions WHERE tenant_id = 'ten-ls' "
                    "AND key IN ('m08New', 'm08Foreign', 'm08Answer') AND id LIKE 'cf-%'"
                )
            )
        engine.dispose()


@pytest.fixture
def body(config_db: Engine) -> dict[str, object]:
    with config_db.connect() as conn:
        locale = conn.execute(
            text("SELECT default_locale FROM institutions WHERE tenant_id = 'ten-ls' ORDER BY id LIMIT 1")
        ).scalar_one()
    return {**FIELD, "key": "m08New", "label": {locale: "Example"}}


@pytest.mark.usefixtures("config_db")
def test_read_routes_and_tenant_boundaries(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    for route, fields in SHAPES.items():
        result = client.get(API + route)
        assert result.status_code == 200, result.text
        page = result.json()
        assert set(page) == {"items", "total", "page", "pageSize"}
        assert page["total"] == len(page["items"]) == (2 if route == "custom-fields" else 1)
        for row in page["items"]:
            assert set(row) == fields and row["tenantId"] == "ten-ls"
            assert row["updatedAt"].endswith("Z")
            if "createdAt" in row:
                assert row["createdAt"].endswith("Z")
                assert datetime.fromisoformat(row["createdAt"]) <= datetime.fromisoformat(row["updatedAt"])
    assert client.get(API + "forms").json()["items"][0]["fieldKeys"] == [FIELD["key"]]
    assert client.get(API + "workflows").json()["items"][0]["steps"] == [STEP]
    fmt = client.get(API + "numbering-formats").json()["items"][0]
    assert (fmt["pattern"], fmt["resetsYearly"], fmt["nextSequence"]) == ("{YY}/{SEQ:4}", True, 1)
    page = client.get(FIELDS, params={"page": 2, "pageSize": 1}).json()
    assert (page["total"], page["page"], page["pageSize"]) == (2, 2, 1)
    assert [row["id"] for row in page["items"]] == ["m08-ls-two"]
    page = client.get(FIELDS, params={"entity": "learner"}).json()
    assert page["total"] == 1 and page["items"][0]["archived"] is True
    assert client.get(FIELDS, params={"entity": "staff"}).json()["total"] == 0
    invalid = client.get(FIELDS, params={"entity": "other"})
    assert invalid.status_code == 400 and invalid.json()["error"]["code"] == "invalid_request"


def test_create_read_back_audit_and_conflict(
    client: TestClient, kc: FakeKeycloak, body: dict[str, object], config_db: Engine
) -> None:
    sign_in(client, kc)
    choice = {**body, "type": "choice", "options": [{"value": "first", "label": {"en": " First "}}]}
    result = client.post(FIELDS, json=choice, headers=csrf(client))
    assert result.status_code == 201, result.text
    saved = result.json()
    assert set(saved) == SHAPES["custom-fields"] | {"options"}
    assert saved["id"].startswith("cf-") and saved["tenantId"] == "ten-ls" and saved["archived"] is False
    assert saved["createdAt"] == saved["updatedAt"]
    assert {k: saved[k] for k in choice} == {**choice, "options": [{"value": "first", "label": {"en": "First"}}]}
    assert saved in client.get(FIELDS).json()["items"]
    for duplicate in (choice, {**body, "key": FIELD["key"]}):
        result = client.post(FIELDS, json=duplicate, headers=csrf(client))
        assert result.status_code == 409 and result.json()["error"]["code"] == "conflict"
    with config_db.connect() as conn:
        audit = conn.execute(
            text(
                "SELECT actor_id, target_type, changes FROM audit_events WHERE tenant_id = 'ten-ls' "
                "AND action = 'm08.customField.created' AND target_id = :id"
            ),
            {"id": saved["id"]},
        ).one()
    assert audit.actor_id == "usr-ls-priya" and audit.target_type == "customField"
    assert {c["field"] for c in audit.changes} == set(choice)
    assert all(set(c) == {"field", "sensitive"} for c in audit.changes)


def test_key_scoped_to_entity_and_tenant(
    client: TestClient, kc: FakeKeycloak, body: dict[str, object], config_db: Engine
) -> None:
    sign_in(client, kc)
    with config_db.begin() as conn:
        conn.execute(text("UPDATE custom_field_definitions SET key = 'm08Foreign' WHERE id = 'm08-rv'"))
    for entity, key in (("staff", "m08Answer"), ("learner", "m08Foreign")):
        payload = {**body, "entity": entity, "key": key, "type": "number", "min": -1.5, "max": 0, "order": 1.0}
        result = client.post(FIELDS, json=payload, headers=csrf(client))
        assert result.status_code == 201, result.text
        row = result.json()
        assert row["min"] == -1.5 and row["max"] == 0 and "options" not in row


def test_body_errors_only_name_contract_fields(client: TestClient, kc: FakeKeycloak, body: dict[str, object]) -> None:
    sign_in(client, kc)
    private = "private-user-key"
    cases: list[tuple[dict[str, object], list[str]]] = [
        ({private: 1}, []),
        ({"label": {private: "test"}}, ["label"]),
        ({"label": {"en-in": "test"}}, ["label"]),
        ({"label": {"en": " "}}, ["label"]),
        ({"type": "choice"}, ["options"]),
        ({"type": "choice", "options": [{"value": "valid", "label": {"en": "ok"}, private: 1}]}, ["options"]),
        ({"type": "multi_choice", "options": [{"value": "ab", "label": {"en": "A"}}] * 2}, ["options"]),
        ({"options": None}, ["options"]),
        ({"type": "number", "min": "1"}, ["min"]),
        ({"type": "number", "min": None}, ["min"]),
        ({"type": "number", "min": 1, "max": 0}, ["max"]),
        ({"min": 0}, ["type"]),
        ({"required": 0, "order": True}, ["required", "order"]),
    ]
    for patch, paths in cases:
        result = client.post(FIELDS, json={**body, **patch}, headers=csrf(client))
        assert result.status_code == 400 and result.json()["error"]["code"] == "invalid_request"
        assert [d["path"] for d in (result.json()["error"].get("details") or [])] == paths
        assert private not in result.text
    malformed = client.post(FIELDS, content="{", headers={**csrf(client), "Content-Type": "application/json"})
    assert malformed.status_code == 400 and malformed.json()["error"]["code"] == "invalid_request"
    # Default-locale validation also precedes the uniqueness check on the archived field.
    result = client.post(FIELDS, json={**body, "label": {"fr-CA": "Essai"}, "key": FIELD["key"]}, headers=csrf(client))
    assert result.status_code == 400 and result.json()["error"]["details"] == [
        {"path": "label", "message": "A label in the default locale is required"}
    ]


def test_guards_precede_input(client: TestClient, kc: FakeKeycloak, config_db: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    result = client.post(FIELDS, content="{", headers=csrf(client))
    assert result.status_code == 403 and result.json()["error"]["code"] == "forbidden"
    switch = text(
        "UPDATE entitlements SET source = :source, enabled = :enabled WHERE tenant_id = 'ten-ls' AND module_id = 'M08'"
    )
    with config_db.begin() as conn:
        previous = conn.execute(
            text("SELECT source, enabled FROM entitlements WHERE tenant_id = 'ten-ls' AND module_id = 'M08'")
        ).mappings().one()
        conn.execute(switch, {"source": "plan", "enabled": False})
    try:
        for route in SHAPES:
            result = client.get(API + route, params={"entity": "unknown"})
            assert result.status_code == 403 and result.json()["error"]["code"] == "module_disabled"
        result = client.post(FIELDS, json={}, headers=csrf(client))
        assert result.status_code == 403 and result.json()["error"]["code"] == "module_disabled"
    finally:
        with config_db.begin() as conn:
            conn.execute(switch, dict(previous))


def test_models_policies_and_privileges(test_db: DbUrls) -> None:
    engine = create_engine(test_db.owner_url)
    with engine.connect() as conn:
        inspector = inspect(conn)
        for model in MODELS:
            name = str(model.__tablename__)
            table = Base.metadata.tables[name]
            actual = inspector.get_columns(name)
            columns = {c["name"]: (str(c["type"].compile(dialect=conn.dialect)), c["nullable"]) for c in actual}
            assert columns == {c.name: (str(c.type.compile(dialect=conn.dialect)), c.nullable) for c in table.columns}
            assert inspector.get_pk_constraint(name)["constrained_columns"] == ["id"]
            assert {tuple(u["column_names"]) for u in inspector.get_unique_constraints(name)} == {
                tuple(c.name for c in u.columns) for u in table.constraints if isinstance(u, UniqueConstraint)
            }
            foreign_key = inspector.get_foreign_keys(name)
            assert len(foreign_key) == 1
            fk = foreign_key[0]
            assert fk["constrained_columns"] == ["tenant_id"]
            assert fk["referred_table"] == "tenants" and fk["referred_columns"] == ["id"]
            assert {c["name"] for c in inspector.get_check_constraints(name)} == {
                c.name for c in table.constraints if isinstance(c, CheckConstraint)
            }
            indexes = [i for i in inspector.get_indexes(name) if not i.get("duplicates_constraint")]
            assert {(i["name"], bool(i["unique"])) for i in indexes} == {(i.name, i.unique) for i in table.indexes}
            state = conn.execute(
                text("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = to_regclass(:name)"),
                {"name": name},
            ).one()
            assert tuple(state) == (True, True)
            policy = conn.scalar(text("SELECT policyname FROM pg_policies WHERE tablename = :name"), {"name": name})
            assert policy == "tenant_isolation"
            for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                granted = conn.scalar(
                    text("SELECT has_table_privilege('nexus_app', :name, :privilege)"),
                    {"name": name, "privilege": privilege},
                )
                assert granted == (privilege == "SELECT" or (privilege == "INSERT" and model is CustomFieldDefinition))
    engine.dispose()
