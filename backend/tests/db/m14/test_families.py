"""M14 family scope, contract parity, encrypted storage and disclosure auditing."""

import asyncio
import json
from collections.abc import Iterator
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from nexus.agent.tenant_export import ENCRYPTED_COLUMNS, _FieldDecryptor
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.vault import Vault, key_name
from nexus.modules.m14.models import AuthorisedPickup, GuardianRelationship, Household
from nexus.modules.m14.schemas import HouseholdOut
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

# Use the same seeded learner, unrelated learner, second tenant and test vault as the M13 scope tests.
m13_vault = m13.m13_vault
learner_rows = m13.records
BASE = "/api/v1/"
REL = "guardian-relationships"
PICKUP = "authorised-pickups"
NOTE = "Example court instruction"
ACTION = "m14.guardianRelationship.sensitiveRead"
ADDRESS = {"line1": "Example street", "city": "Pune", "countryCode": "IN"}


@pytest.fixture
def families(learner_rows: Engine, m13_vault: Vault) -> Iterator[Engine]:
    cipher = FieldCipher(m13_vault)
    secret = asyncio.run(
        cipher.encrypt(key_name("ten-ls", "tenant_data"), "guardian_relationships.court_order_note", NOTE)
    )
    with learner_rows.begin() as conn:
        for learner in ("m13-a", "m13-b", "m13-rv"):
            child, tenant = conn.execute(
                text("SELECT person_id, tenant_id FROM learners WHERE id = :id"), {"id": learner}
            ).one()
            adult = conn.execute(
                text("SELECT person_id FROM role_profiles WHERE tenant_id = :t AND kind = 'guardian' LIMIT 1"),
                {"t": tenant},
            ).scalar_one()
            args = {"id": learner, "tenant": tenant, "child": child, "adult": adult, "addr": json.dumps(ADDRESS)}
            conn.execute(
                text(
                    "INSERT INTO households (id, tenant_id, name, address, learner_person_ids, guardian_person_ids, "
                    "primary_language) VALUES (:id, :tenant, 'Household', CAST(:addr AS jsonb), "
                    "ARRAY[CAST(:child AS varchar)], ARRAY[CAST(:adult AS varchar)], 'en-IN')"
                ),
                args,
            )
            restricted = learner == "m13-a"
            conn.execute(
                text(
                    "INSERT INTO guardian_relationships (id, tenant_id, guardian_person_id, learner_person_id, kind, "
                    "parental_responsibility, lives_with_learner, contact_priority, pickup_right, court_order_note, "
                    "effective_from) VALUES (:id, :tenant, :adult, :child, 'parent', true, true, 1, :right, :note, "
                    "'2026-01-01')"
                ),
                {
                    **args,
                    "right": "court_restricted" if restricted else "allowed",
                    "note": secret if restricted else None,
                },
            )
            conn.execute(
                text(
                    "INSERT INTO authorised_pickups (id, tenant_id, learner_person_id, name, phone, "
                    "relationship_label, valid_from, added_by_person_id) VALUES (:id, :tenant, :child, 'Pickup', "
                    "'+919876543210', 'Relative', '2026-01-01', :adult)"
                ),
                args,
            )
        conn.execute(
            text(
                "INSERT INTO households (id, tenant_id, name, learner_person_ids, guardian_person_ids) "
                "VALUES ('m14-unlinked', 'ten-ls', 'Unlinked', ARRAY['no-learner-record'], '{}')"
            )
        )
    try:
        yield learner_rows
    finally:
        with learner_rows.begin() as conn:
            for table in ("households", "guardian_relationships", "authorised_pickups"):
                conn.execute(
                    text(f"DELETE FROM {table} WHERE id IN ('m13-a','m13-b','m13-rv','m14-unlinked')")  # noqa: S608
                )


def event_count(engine: Engine) -> int:
    with engine.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM audit_events WHERE action = :a"), {"a": ACTION}).scalar_one()
        return int(count)


def test_tenant_scope_and_disclosure(client: TestClient, kc: FakeKeycloak, families: Engine) -> None:
    sign_in(client, kc)
    before = event_count(families)
    houses = client.get(BASE + "households").json()
    assert [r["id"] for r in houses["items"]] == ["m13-a", "m13-b", "m14-unlinked"]
    assert houses["items"][-1]["address"] is None
    house = houses["items"][0]
    assert set(house) == {
        "id", "tenantId", "name", "address", "learnerPersonIds", "guardianPersonIds", "primaryLanguage",
        "createdAt", "updatedAt",
    }
    assert house["address"] == ADDRESS and house["primaryLanguage"] == "en-IN"
    child = house["learnerPersonIds"][0]
    for route in (REL, PICKUP):
        page = client.get(BASE + route, params={"pageSize": 1, "page": 2}).json()
        assert (page["total"], page["page"], page["pageSize"]) == (2, 2, 1)
        assert [r["id"] for r in page["items"]] == ["m13-b"]
        for outside in ("missing", "no-learner-record"):
            assert client.get(BASE + route, params={"learnerPersonId": outside}).status_code == 404
    pickup = client.get(BASE + PICKUP, params={"learnerPersonId": child}).json()["items"][0]
    assert set(pickup) == {
        "id", "tenantId", "learnerPersonId", "name", "phone", "relationshipLabel", "validFrom", "validTo",
        "addedByPersonId", "createdAt",
    }
    assert pickup["validFrom"] == "2026-01-01" and pickup["createdAt"].endswith("Z")
    assert event_count(families) == before
    row = client.get(BASE + REL, params={"learnerPersonId": child}).json()["items"][0]
    assert set(row) == {
        "id", "tenantId", "guardianPersonId", "learnerPersonId", "kind", "parentalResponsibility", "livesWithLearner",
        "contactPriority", "pickupRight", "courtOrderNote", "effectiveFrom", "effectiveTo", "createdAt", "updatedAt",
    }
    assert row["courtOrderNote"] == NOTE and row["pickupRight"] == "court_restricted"
    with families.begin() as conn:
        conn.execute(
            text(
                "UPDATE guardian_relationships SET pickup_right = 'court_restricted', court_order_note = "
                "(SELECT court_order_note FROM guardian_relationships WHERE id = 'm13-a') WHERE id = 'm13-b'"
            )
        )
    assert [r["courtOrderNote"] for r in client.get(BASE + REL).json()["items"]] == [NOTE, NOTE]
    assert event_count(families) == before + 2
    with families.connect() as conn:
        events = conn.execute(
            text("SELECT target_id, changes FROM audit_events WHERE action = :a ORDER BY seq DESC LIMIT 2"),
            {"a": ACTION},
        ).all()
    assert [e.target_id for e in events] == ["guardianRelationshipList", child]
    for event in events:
        assert [c["field"] for c in event.changes] == ["courtOrderNote"]
        assert set(event.changes[0]) == {"field", "sensitive"}


def test_guardian_scope_and_mask(
    client: TestClient, kc: FakeKeycloak, families: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    m13.guardian(client, kc, families)
    before = event_count(families)
    decrypt = AsyncMock(side_effect=AssertionError("masked read attempted decryption"))
    monkeypatch.setattr(FieldCipher, "decrypt", decrypt)
    for route in ("households", REL, PICKUP):
        page = client.get(BASE + route).json()
        assert page["total"] == 1 and [r["id"] for r in page["items"]] == ["m13-a"]
    house = client.get(BASE + "households").json()["items"][0]
    child = house["learnerPersonIds"][0]
    for route in (REL, PICKUP):
        params = {"learnerPersonId": child}
        assert client.get(BASE + route, params=params).json()["total"] == 1
        assert client.get(BASE + route, params={"learnerPersonId": "m13-person"}).status_code == 404
    row = client.get(BASE + REL).json()["items"][0]
    assert row["courtOrderNote"] is None and row["pickupRight"] == "court_restricted"
    decrypt.assert_not_awaited()
    assert event_count(families) == before


def test_no_family_is_forbidden(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    engine = create_engine(test_db.owner_url)
    try:
        m13.guardian(client, kc, engine)
        for route in ("households", REL, PICKUP):
            response = client.get(BASE + route)
            assert response.status_code == 403 and response.json()["error"]["code"] == "forbidden"
    finally:
        engine.dispose()


def test_storage_and_export(families: Engine, m13_vault: Vault) -> None:
    with families.connect() as conn:
        for model in (Household, GuardianRelationship, AuthorisedPickup):
            table = model.__tablename__
            assert set(model.__table__.columns.keys()) == {c["name"] for c in inspect(conn).get_columns(table)}
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'SELECT'), "
                    "has_table_privilege('nexus_app', oid, 'INSERT,UPDATE,DELETE,TRUNCATE') FROM pg_class "
                    "WHERE oid = to_regclass(:t)"
                ),
                {"t": table},
            ).one()
            assert tuple(flags) == (True, True, True, False)
        row = dict(conn.execute(text("SELECT * FROM guardian_relationships WHERE id = 'm13-a'")).mappings().one())
    assert row["court_order_note"].startswith("v1:") and NOTE not in row["court_order_note"]
    decryptor = _FieldDecryptor("ten-ls", ENCRYPTED_COLUMNS, m13_vault, None)
    try:
        assert decryptor.apply("guardian_relationships", row)["court_order_note"] == NOTE
    finally:
        decryptor.close()
    with pytest.raises(IntegrityError), families.begin() as conn:
        conn.execute(text("UPDATE guardian_relationships SET court_order_note = 'plaintext' WHERE id = 'm13-a'"))


def test_household_contract_checks(families: Engine) -> None:
    with families.connect() as conn:
        row = dict(conn.execute(text("SELECT * FROM households WHERE id = 'm13-a'")).mappings().one())
    for address in (
        {**ADDRESS, "line2": None}, {**ADDRESS, "city": " "}, {**ADDRESS, "postalCode": "1" * 21},
        {**ADDRESS, "countryCode": "ZZ"}, {**ADDRESS, "extra": "x"}, {"line1": "Example", "city": "Pune"},
    ):
        with pytest.raises(ValidationError):
            HouseholdOut.model_validate({**row, "address": address})
        with pytest.raises(IntegrityError), families.begin() as conn:
            conn.execute(
                text("UPDATE households SET address = CAST(:a AS jsonb) WHERE id = 'm13-a'"),
                {"a": json.dumps(address)},
            )
    for field, value in (
        ("learner_person_ids", []), ("learner_person_ids", ["id", "id"]), ("guardian_person_ids", [""]),
        ("guardian_person_ids", [str(i) for i in range(11)]), ("primary_language", "en-in"),
    ):
        with pytest.raises(ValidationError):
            HouseholdOut.model_validate({**row, field: value})
        with pytest.raises(IntegrityError), families.begin() as conn:
            conn.execute(
                text(f"UPDATE households SET {field} = :value WHERE id = 'm13-a'"),  # noqa: S608
                {"value": value},
            )
