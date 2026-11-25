"""M13 frozen response shapes, family boundaries, encrypted storage and sensitive-read auditing."""

import asyncio
import json
import os
from collections.abc import Iterator
from typing import cast
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import IntegrityError

from nexus.agent.tenant_export import ENCRYPTED_COLUMNS, _FieldDecryptor
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.vault import DataKey, Vault, key_name
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

URL = "/api/v1/learners"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
FLAGS = [{"kind": "allergy", "label": "Test allergen", "note": None}]
PRIVATE = {"careCode": "restricted test value"}
PUBLIC = {"busRoute": "Test route"}
ACTION = "m13.learner.sensitiveRead"
SUFFIXES = ("", "/enrolments", "/documents")
STAMPED = {"id", "tenantId", "createdAt", "updatedAt"}


@pytest.fixture
def m13_vault(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> Vault:
    # Substitute only the key service. Both storage and export still use the production FieldCipher.
    keys: dict[str, bytes] = {}

    async def data_key(name: str) -> DataKey:
        key = keys.setdefault(name, os.urandom(32))
        return DataKey(plaintext=key, wrapped=name, version=1)

    async def unwrap(name: str, wrapped: str) -> bytes:
        assert wrapped == name
        return keys[name]

    stub = Mock(spec=Vault)
    stub.data_key = AsyncMock(side_effect=data_key)
    stub.unwrap = AsyncMock(side_effect=unwrap)
    monkeypatch.setattr(cast(FastAPI, client.app).state, "field_cipher", FieldCipher(stub))
    return cast(Vault, stub)


@pytest.fixture
def records(test_db: DbUrls, m13_vault: Vault) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    cipher = FieldCipher(m13_vault)
    health = asyncio.run(cipher.encrypt(key_name("ten-ls", "field_health"), "learners.health_flags", json.dumps(FLAGS)))
    private = asyncio.run(
        cipher.encrypt(key_name("ten-ls", "tenant_data"), "learners.sensitive_custom_fields", json.dumps(PRIVATE))
    )
    with engine.begin() as conn:
        child = (
            conn.execute(
                text(
                    "SELECT rp.* FROM role_profiles rp JOIN guardian_links gl ON gl.learner_person_id = rp.person_id "
                    "JOIN role_profiles guardian ON guardian.person_id = gl.guardian_person_id "
                    "WHERE rp.kind = 'learner' AND rp.tenant_id = 'ten-ls' AND guardian.id = 'rp-ls-sunita-guardian' "
                    "ORDER BY rp.id LIMIT 1"
                )
            )
            .mappings()
            .one()
        )
        conn.execute(
            text(
                "INSERT INTO people (id, tenant_id, legal_name, preferred_name, date_of_birth, is_minor, "
                "preferred_locale, retention_state, created_at, updated_at) SELECT 'm13-person', tenant_id, "
                "legal_name, preferred_name, date_of_birth, true, preferred_locale, retention_state, now(), now() "
                "FROM people WHERE id = :child"
            ),
            {"child": child["person_id"]},
        )
        conn.execute(
            text(
                "INSERT INTO role_profiles (id, tenant_id, person_id, institution_id, campus_id, kind, "
                "academic_year_id, effective_from, effective_to, status) "
                "SELECT 'm13-profile', tenant_id, 'm13-person', institution_id, campus_id, kind, "
                "academic_year_id, effective_from, effective_to, status FROM role_profiles WHERE id = :profile"
            ),
            {"profile": child["id"]},
        )
        conn.execute(
            text(
                """
                INSERT INTO custom_field_definitions
                    (id, tenant_id, entity, key, label, type, required, sensitive, "order", archived)
                VALUES ('m13-field', 'ten-ls', 'learner', 'careCode', CAST(:label AS jsonb),
                        'text', false, true, 0, false)
                """
            ),
            {"label": json.dumps({"en": "Test field"})},
        )
        foreign = conn.execute(
            text("SELECT id FROM role_profiles WHERE tenant_id = 'ten-rv' AND kind = 'learner' ORDER BY id LIMIT 1")
        ).scalar_one()
        for learner, profile in (("m13-a", child["id"]), ("m13-b", "m13-profile"), ("m13-rv", foreign)):
            conn.execute(
                text(
                    "INSERT INTO learners (id, tenant_id, institution_id, campus_id, person_id, role_profile_id, "
                    "learner_number, status, admission_date, retention_state, health_flags, custom_fields, "
                    "sensitive_custom_fields) SELECT :id, tenant_id, institution_id, campus_id, person_id, id, "
                    ":id, 'enrolled', '2026-01-01', 'active', :health, CAST(:public AS jsonb), :private "
                    "FROM role_profiles WHERE id = :profile"
                ),
                {
                    "id": learner,
                    "profile": profile,
                    "health": health if learner == "m13-a" else None,
                    "public": json.dumps(PUBLIC),
                    "private": private if learner == "m13-a" else None,
                },
            )
        conn.execute(
            text(
                "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
                "VALUES ('m13-pr', 'ten-ls', 'ins-ls', 'M13', 'Program', 'course', true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, "
                "code, name) VALUES ('m13-cg', 'ten-ls', 'ins-ls', 'cal-ls-2026', 'm13-pr', 'group', 'M13', 'Group')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, class_group_id, "
                "status, effective_from) VALUES ('m13-en', 'ten-ls', 'm13-a', 'cal-ls-2026', 'm13-pr', "
                "'m13-cg', 'active', '2026-01-01')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO learner_documents (id, tenant_id, learner_id, kind, file_name, content_type, "
                "size_bytes, verified, uploaded_at) VALUES ('m13-doc', 'ten-ls', 'm13-a', 'photo', "
                "'test.png', 'image/png', 100, false, now())"
            )
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            for table, ids in (
                ("learner_documents", ["m13-doc"]),
                ("enrolments", ["m13-en"]),
                ("class_groups", ["m13-cg"]),
                ("programs", ["m13-pr"]),
                ("learners", ["m13-a", "m13-b", "m13-rv"]),
                ("role_profiles", ["m13-profile"]),
                ("people", ["m13-person"]),
                ("custom_field_definitions", ["m13-field"]),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def audit_count(engine: Engine) -> int:
    with engine.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM audit_events WHERE action = :a"), {"a": ACTION}).scalar_one()
        return int(count)


def guardian(client: TestClient, kc: FakeKeycloak, engine: Engine) -> None:
    with engine.connect() as conn:
        user = conn.execute(
            text(
                "SELECT email, idp_subject FROM users WHERE person_id = "
                "(SELECT person_id FROM role_profiles WHERE id = 'rp-ls-sunita-guardian')"
            )
        ).one()
    sign_in(client, kc, email=user.email, sub=user.idp_subject or "kc-sunita")


def test_staff_disclosure_and_paging(client: TestClient, kc: FakeKeycloak, records: Engine) -> None:
    sign_in(client, kc)
    before = audit_count(records)
    page = client.get(URL, params={"pageSize": 1, "page": 2}).json()
    assert (page["total"], page["page"], page["pageSize"]) == (2, 2, 1)
    assert [row["id"] for row in page["items"]] == ["m13-b"]
    assert audit_count(records) == before
    row = client.get(URL + "/m13-a").json()
    assert set(row) == STAMPED | set(
        [
            "institutionId",
            "campusId",
            "personId",
            "roleProfileId",
            "learnerNumber",
            "admissionDate",
            "status",
            "leftOn",
            "healthFlags",
            "customFields",
            "retentionState",
        ]
    )
    assert row["healthFlags"] == FLAGS and row["customFields"] == {**PUBLIC, **PRIVATE}
    assert row["admissionDate"] == "2026-01-01" and row["createdAt"].endswith("Z")
    with records.begin() as conn:
        conn.execute(
            text(
                "UPDATE learners SET health_flags = (SELECT health_flags FROM learners WHERE id = 'm13-a') "
                "WHERE id = 'm13-b'"
            )
        )
    listing = client.get(URL).json()["items"]
    assert listing[0] == row and listing[1]["healthFlags"] == FLAGS
    assert audit_count(records) == before + 2
    with records.connect() as conn:
        events = conn.execute(
            text("SELECT target_id, changes FROM audit_events WHERE action = :a ORDER BY seq DESC LIMIT 2"),
            {"a": ACTION},
        ).all()
    assert [event.target_id for event in events] == ["learnerList", "m13-a"]
    for event in events:
        assert {c["field"] for c in event.changes} == {"healthFlags", "customFields"}
        assert all(set(c) == {"field", "sensitive"} for c in event.changes)
    for suffix in SUFFIXES:
        assert client.get(URL + "/m13-rv" + suffix).status_code == 404


def test_teacher_never_decrypts(
    client: TestClient, kc: FakeKeycloak, records: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    sign_in(client, kc, **TEACHER)
    before = audit_count(records)
    decrypt = AsyncMock(side_effect=AssertionError("masked read attempted decryption"))
    monkeypatch.setattr(FieldCipher, "decrypt", decrypt)
    rows = client.get(URL).json()["items"]
    assert [r["id"] for r in rows] == ["m13-a", "m13-b"]
    row = client.get(URL + "/m13-a").json()
    assert rows[0] == row and row["healthFlags"] == [] and row["customFields"] == PUBLIC
    decrypt.assert_not_awaited()
    assert audit_count(records) == before


def test_guardian_visibility_and_children(client: TestClient, kc: FakeKeycloak, records: Engine) -> None:
    guardian(client, kc, records)
    before = audit_count(records)
    page = client.get(URL).json()
    assert page["total"] == 1 and [r["id"] for r in page["items"]] == ["m13-a"]
    row = client.get(URL + "/m13-a").json()
    assert row == page["items"][0] and row["healthFlags"] == FLAGS and row["customFields"] == {**PUBLIC, **PRIVATE}
    for other in ("m13-b", "m13-rv", "missing"):
        for suffix in SUFFIXES:
            assert client.get(f"{URL}/{other}{suffix}").status_code == 404
    for suffix in SUFFIXES[1:]:
        assert client.get(URL + "/m13-b" + suffix, params={"page": 0}).status_code == 404
        assert client.get(URL + "/m13-a" + suffix, params={"page": 0}).status_code == 400
    enrolment = client.get(URL + "/m13-a/enrolments").json()["items"][0]
    assert set(enrolment) == STAMPED | set(
        [
            "learnerId",
            "academicYearId",
            "programId",
            "yearLevelId",
            "classGroupId",
            "rollNumber",
            "status",
            "effectiveFrom",
            "effectiveTo",
        ]
    )
    assert enrolment["learnerId"] == "m13-a" and enrolment["effectiveFrom"] == "2026-01-01"
    doc = client.get(URL + "/m13-a/documents").json()["items"][0]
    assert set(doc) == set(
        [
            "id",
            "tenantId",
            "learnerId",
            "kind",
            "fileName",
            "contentType",
            "sizeBytes",
            "verified",
            "verifiedByStaffProfileId",
            "uploadedAt",
        ]
    )
    assert doc["sizeBytes"] == 100 and doc["uploadedAt"].endswith("Z")
    assert audit_count(records) == before


def test_no_family_access(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    engine = create_engine(test_db.owner_url)
    try:
        guardian(client, kc, engine)
        for path in ("", "/missing", "/missing/enrolments", "/missing/documents"):
            response = client.get(URL + path)
            assert response.status_code == 403 and response.json()["error"]["code"] == "forbidden"
    finally:
        engine.dispose()


def test_storage_rls_and_export(records: Engine, m13_vault: Vault) -> None:
    with records.connect() as conn:
        for table in ("learners", "enrolments", "learner_documents"):
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'SELECT'), "
                    "has_table_privilege('nexus_app', oid, 'INSERT,UPDATE,DELETE,TRUNCATE') FROM pg_class "
                    "WHERE oid = to_regclass(:t)"
                ),
                {"t": table},
            ).one()
            assert tuple(flags) == (True, True, True, False)
        row = dict(conn.execute(text("SELECT * FROM learners WHERE id = 'm13-a'")).mappings().one())
    assert row["custom_fields"] == PUBLIC
    for col in ("health_flags", "sensitive_custom_fields"):
        assert row[col].startswith("v1:") and "Test allergen" not in row[col] and PRIVATE["careCode"] not in row[col]
    decryptor = _FieldDecryptor("ten-ls", ENCRYPTED_COLUMNS, m13_vault, None)
    try:
        exported = decryptor.apply("learners", row)
        assert json.loads(exported["health_flags"]) == FLAGS
        assert json.loads(exported["sensitive_custom_fields"]) == PRIVATE
    finally:
        decryptor.close()
    with pytest.raises(IntegrityError), records.begin() as conn:
        conn.execute(
            text("UPDATE learners SET custom_fields = CAST(:data AS jsonb) WHERE id = 'm13-a'"),
            {"data": json.dumps(PRIVATE)},
        )
