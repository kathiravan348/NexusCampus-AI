"""Control database (NEX-096): its own migrations, role and seed, in a throwaway database."""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.staff import DbStaffStore


def test_only_control_tables_and_read_only_app_role(control_db: tuple[str, str]) -> None:
    owner_url, app_url = control_db
    engine = create_engine(owner_url)
    with engine.connect() as conn:
        tables = {r[0] for r in conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))}
    engine.dispose()
    assert tables == {
        "staff_users",
        "role_permissions",
        "staff_sessions",
        "control_alembic_version",
        "partners",
        "accounts",
        "account_contacts",
        "opportunities",
        "contracts",
        "account_notes",
    }
    app = create_engine(app_url)
    with app.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM staff_users")).scalar_one() == 9
        with pytest.raises(ProgrammingError):
            conn.execute(text("UPDATE staff_users SET display_name = 'x'"))
    app.dispose()


@pytest.mark.anyio
async def test_store_builds_the_staff_session(control_db: tuple[str, str]) -> None:
    _, app_url = control_db
    engine = create_async_engine(app_url)
    try:
        store = DbStaffStore(engine)
        session = await store.session_of("stf-0001", 60)
        assert session is not None
        assert session.staff.display_name == "Nisha Verma"
        assert "ctl.trust.read" in session.permissions
        partner = await store.session_of("stf-0051", 60)
        assert partner is not None and partner.staff.partner_id is not None
        assert "ctl.trust.read" not in partner.permissions
        assert await store.session_of("stf-unknown", 60) is None
    finally:
        await engine.dispose()
