"""M07 services (NEX-056): preferences read / save, and the shared SELECTs."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.ids import new_id
from nexus.modules.m07.schemas import CHANNELS, ChannelAvailability, PreferenceOut, PreferencesIn, PreferencesOut

TEMPLATE_SELECT = (
    "SELECT id, tenant_id, event_type, channel, locale, subject, body, version, enabled, updated_at "
    "FROM notification_templates"
)
PREFERENCE_SELECT = (
    "SELECT user_id, channel, event_type, enabled, quiet_start, quiet_end, time_zone FROM notification_preferences"
)


def preference_out(row: dict[str, object]) -> PreferenceOut:
    quiet = {"start": row["quiet_start"], "end": row["quiet_end"]} if row["quiet_start"] else None
    return PreferenceOut.model_validate(
        {
            "user_id": row["user_id"],
            "channel": row["channel"],
            "event_type": row["event_type"],
            "enabled": row["enabled"],
            "quiet_hours": quiet,
            "time_zone": row["time_zone"],
        }
    )


async def available_channels(db: AsyncSession) -> set[str]:
    """A channel counts as set up when the tenant has a template for it; push needs a provider (Stage 2)."""
    rows = await db.execute(text("SELECT DISTINCT channel FROM notification_templates"))
    return {c for c in rows.scalars() if c != "push"}


async def preferences_out(db: AsyncSession, user_id: str) -> PreferencesOut:
    rows = await db.execute(
        text(PREFERENCE_SELECT + " WHERE user_id = :u ORDER BY channel, event_type"), {"u": user_id}
    )
    available = await available_channels(db)
    return PreferencesOut(
        preferences=[preference_out(dict(r)) for r in rows.mappings()],
        channels=[ChannelAvailability(channel=c, available=c in available) for c in CHANNELS],
    )


async def user_time_zone(db: AsyncSession, user_id: str) -> str:
    """The zone of the user's existing preferences, else the institution's, else UTC (as the mock)."""
    zone = (
        await db.execute(
            text("SELECT time_zone FROM notification_preferences WHERE user_id = :u LIMIT 1"), {"u": user_id}
        )
    ).scalar_one_or_none()
    if zone is None:
        zone = (
            await db.execute(text("SELECT time_zone FROM institutions ORDER BY created_at, id LIMIT 1"))
        ).scalar_one_or_none()
    return str(zone or "UTC")


async def save_preferences(db: AsyncSession, tenant_id: str, user_id: str, data: PreferencesIn) -> PreferencesOut:
    """One row per channel for all events; per-event rows keep their switch but follow the new quiet hours."""
    zone = await user_time_zone(db, user_id)
    start = data.quiet_hours.start if data.quiet_hours else None
    end = data.quiet_hours.end if data.quiet_hours else None
    await db.execute(
        text("DELETE FROM notification_preferences WHERE user_id = :u AND event_type IS NULL"), {"u": user_id}
    )
    await db.execute(
        text("UPDATE notification_preferences SET quiet_start = :s, quiet_end = :e WHERE user_id = :u"),
        {"s": start, "e": end, "u": user_id},
    )
    for switch in data.channels:
        await db.execute(
            text(
                "INSERT INTO notification_preferences (id, tenant_id, user_id, channel, event_type, enabled, "
                "quiet_start, quiet_end, time_zone) VALUES (:id, :t, :u, :c, NULL, :en, :s, :e, :z) "
                "ON CONFLICT (user_id, channel, event_type) DO UPDATE SET enabled = EXCLUDED.enabled"
            ),
            {
                "id": new_id("npf"),
                "t": tenant_id,
                "u": user_id,
                "c": switch.channel,
                "en": switch.enabled,
                "s": start,
                "e": end,
                "z": zone,
            },
        )
    return await preferences_out(db, user_id)
