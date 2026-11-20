"""Row-Level Security (ARCHITECTURE §6): the app role sees nothing without a tenant context, and only its own
tenant's rows with one; it can never write into another tenant.
"""

from collections.abc import Iterator

import pytest
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.exc import DBAPIError

from tests.db.conftest import DbUrls

TABLES = ("tenants", "groups", "institutions", "campuses", "academic_calendars")
LS, RV = "ten-ls", "ten-rv"


@pytest.fixture(scope="module")
def app_engine(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.app_url)
    yield engine
    engine.dispose()


def scope(conn: Connection, tenant_id: str) -> None:
    conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})


def count(conn: Connection, table: str) -> int:
    return int(conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one())  # noqa: S608


def test_app_role_cannot_bypass_rls(app_engine: Engine) -> None:
    with app_engine.connect() as conn:
        row = conn.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).one()
    assert tuple(row) == (False, False)


def test_no_tenant_context_sees_zero_rows(app_engine: Engine) -> None:
    with app_engine.connect() as conn:
        assert {t: count(conn, t) for t in TABLES} == dict.fromkeys(TABLES, 0)


def test_tenant_context_sees_only_its_rows(app_engine: Engine) -> None:
    with app_engine.begin() as conn:
        scope(conn, RV)
        assert count(conn, "tenants") == 1
        assert count(conn, "campuses") == 2  # Riverside North and South
        tenant_ids = conn.execute(
            text("SELECT DISTINCT tenant_id FROM institutions UNION SELECT DISTINCT tenant_id FROM campuses")
        ).scalars()
        assert set(tenant_ids) == {RV}


def test_context_ends_with_the_transaction(app_engine: Engine) -> None:
    with app_engine.connect() as conn:
        with conn.begin():
            scope(conn, LS)
            assert count(conn, "institutions") == 1
        assert count(conn, "institutions") == 0


def test_cannot_insert_rows_for_another_tenant(app_engine: Engine) -> None:
    with pytest.raises(DBAPIError, match="row-level security"), app_engine.begin() as conn:
        scope(conn, LS)
        conn.execute(
            text("INSERT INTO groups (id, tenant_id, name, region) VALUES ('grp-x', :other, 'X', 'eu')"),
            {"other": RV},
        )


def test_cannot_update_or_delete_another_tenants_rows(app_engine: Engine) -> None:
    with app_engine.begin() as conn:
        scope(conn, LS)
        updated = conn.execute(text("UPDATE campuses SET name = 'hacked' WHERE tenant_id = :t"), {"t": RV})
        deleted = conn.execute(text("DELETE FROM academic_calendars WHERE tenant_id = :t"), {"t": RV})
        assert (updated.rowcount, deleted.rowcount) == (0, 0)
        conn.rollback()


def test_cannot_link_to_another_tenants_institution(app_engine: Engine) -> None:
    # Composite foreign key (institution_id, tenant_id): a campus belongs to its own tenant's institution.
    with pytest.raises(DBAPIError), app_engine.begin() as conn:
        scope(conn, LS)
        conn.execute(
            text(
                "INSERT INTO campuses (id, tenant_id, institution_id, code, name, address) "
                "VALUES ('cmp-x', :t, 'ins-rv', 'X', 'X', '{}'::jsonb)"
            ),
            {"t": LS},
        )


def test_app_role_cannot_create_tenants(app_engine: Engine) -> None:
    with pytest.raises(DBAPIError, match="permission denied"), app_engine.begin() as conn:
        scope(conn, "ten-new")
        conn.execute(text("INSERT INTO tenants (id, name, type, region) VALUES ('ten-new', 'N', 'ey', 'in')"))
