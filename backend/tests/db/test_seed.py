"""The demo seed (D16) loads all five tenants from the exported mock fixtures, idempotently."""

from sqlalchemy import create_engine, text

from nexus.seed.demo import load_fixtures, seed
from tests.db.conftest import DbUrls

TABLES = {
    "tenants": "tenants",
    "groups": "groups",
    "institutions": "institutions",
    "campuses": "campuses",
    "academic_calendars": "calendars",
    "audit_events": "auditEvents",
    "people": "people",
    "users": "users",
    "role_profiles": "roleProfiles",
    "sessions": "sessions",
    "roles": "roles",
    "role_assignments": "roleAssignments",
    "entitlements": "entitlements",
}


def counts(owner_url: str) -> dict[str, int]:
    engine = create_engine(owner_url)
    try:
        with engine.connect() as conn:
            return {
                t: int(conn.execute(text(f"SELECT count(*) FROM {t}")).scalar_one())  # noqa: S608
                for t in TABLES
            }
    finally:
        engine.dispose()


def expected() -> dict[str, int]:
    fixtures = load_fixtures()
    return {t: len(fixtures[key]) for t, key in TABLES.items()}


def test_reset_seed_counts_match_the_mock_fixtures(test_db: DbUrls) -> None:
    # Other tests in this session append audit events; a reset brings the demo data back to the fixtures.
    seed(test_db.owner_url, reset=True)
    assert counts(test_db.owner_url) == expected()
    assert expected()["tenants"] == 5


def test_seed_is_idempotent(test_db: DbUrls) -> None:
    before = counts(test_db.owner_url)
    seed(test_db.owner_url)
    assert counts(test_db.owner_url) == before


def test_seeded_values_round_trip(test_db: DbUrls) -> None:
    engine = create_engine(test_db.owner_url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT default_locale, supported_locales, time_zone, currency, weekend_days "
                    "FROM institutions WHERE id = 'ins-ax'"
                )
            ).one()
            holiday = conn.execute(
                text("SELECT holidays->0->>'name' FROM academic_calendars WHERE id = 'cal-ax-2026'")
            ).scalar_one()
    finally:
        engine.dispose()
    assert tuple(row) == ("ta-IN", ["ta-IN", "en-IN"], "Asia/Kolkata", "INR", [0])
    assert holiday == "பொங்கல்"
