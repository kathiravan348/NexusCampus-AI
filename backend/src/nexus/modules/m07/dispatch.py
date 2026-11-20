"""Turns one domain event into notifications (NEX-056, M07).

Events that notify people carry `payload.recipientPersonIds` (people of the tenant) and `payload.values` (the
template's placeholders); `payload.urgent: true` marks a safety event that ignores quiet hours. For each recipient
and channel with an enabled template:

1. template locale: the person's preferred locale → the institution default → English (exact tag first,
   then the same language, so `en` finds `en-IN`);
2. the recipient's preference for this event (else for all events) on that channel: off → `suppressed`;
3. quiet hours (may cross midnight) in the preference's time zone → `suppressed`, unless urgent;
4. render (ICU) and hand to the channel adapter → `sent` / `delivered` / `failed`.

Each event + person + channel is delivered at most once (unique key), so a replayed event changes nothing.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.ids import new_id
from nexus.modules.m07.channels import Channel, OutgoingMessage, SendResult
from nexus.modules.m07.render import render
from nexus.modules.m07.service import TEMPLATE_SELECT

QUIET = "Quiet hours"
OFF = "Turned off by the recipient"


@dataclass(frozen=True)
class Event:
    event_id: str
    tenant_id: str
    event_type: str
    payload: dict[str, Any]


def in_quiet_hours(start: str, end: str, zone: str, now: datetime) -> bool:
    """`start` to `end` in local time; a window like 21:00 to 07:00 crosses midnight."""
    local = now.astimezone(ZoneInfo(zone)).time()
    begin, finish = time.fromisoformat(start), time.fromisoformat(end)
    return begin <= local < finish if begin < finish else (local >= begin or local < finish)


def pick_template(templates: list[dict[str, Any]], wanted: list[str]) -> dict[str, Any] | None:
    """First wanted locale with a template (exact, then same language: `en` finds `en-IN`), else any English."""
    for locale in [*wanted, "en"]:
        exact = next((t for t in templates if t["locale"] == locale), None)
        same = next((t for t in templates if t["locale"].split("-")[0] == locale.split("-")[0]), None)
        if exact or same:
            return exact or same
    return None


async def _recipient(db: AsyncSession, person_id: str) -> dict[str, Any] | None:
    row = await db.execute(
        text(
            "SELECT p.id, p.preferred_locale, u.id AS user_id FROM people p LEFT JOIN users u ON u.person_id = p.id "
            "WHERE p.id = :p"
        ),
        {"p": person_id},
    )
    found = row.mappings().first()
    return dict(found) if found else None


async def _preference(db: AsyncSession, user_id: str | None, channel: str, event_type: str) -> dict[str, Any] | None:
    if user_id is None:
        return None
    rows = await db.execute(
        text(
            "SELECT enabled, quiet_start, quiet_end, time_zone FROM notification_preferences "
            "WHERE user_id = :u AND channel = :c AND (event_type = :e OR event_type IS NULL) "
            "ORDER BY event_type NULLS LAST LIMIT 1"
        ),
        {"u": user_id, "c": channel, "e": event_type},
    )
    found = rows.mappings().first()
    return dict(found) if found else None


async def _record(db: AsyncSession, event: Event, template: dict[str, Any], person: str, result: SendResult) -> bool:
    """Stores one delivery; False when this event + person + channel was already handled."""
    now = datetime.now(UTC)
    status = result.status
    created = await db.execute(
        text(
            "INSERT INTO notification_deliveries (id, tenant_id, template_id, recipient_person_id, channel, status, "
            "reason, queued_at, sent_at, event_id) VALUES (:id, :t, :tpl, :p, :c, :s, :r, :q, :sent, :e) "
            "ON CONFLICT (event_id, recipient_person_id, channel) DO NOTHING"
        ),
        {
            "id": new_id("ndl"),
            "t": event.tenant_id,
            "tpl": template["id"],
            "p": person,
            "c": template["channel"],
            "s": status,
            "r": result.reason,
            "q": now,
            "sent": now if status in ("sent", "delivered", "failed") else None,
            "e": event.event_id,
        },
    )
    return bool(getattr(created, "rowcount", 0))


async def already_sent(db: AsyncSession, event_id: str, person: str, channel: str) -> bool:
    row = await db.execute(
        text("SELECT 1 FROM notification_deliveries WHERE event_id = :e AND recipient_person_id = :p AND channel = :c"),
        {"e": event_id, "p": person, "c": channel},
    )
    return row.first() is not None


async def dispatch(db: AsyncSession, event: Event, channels: dict[str, Channel], now: datetime | None = None) -> int:
    """Delivers `event`; returns how many new delivery rows were written."""
    recipients = event.payload.get("recipientPersonIds") or []
    if not recipients:
        return 0
    at = now or datetime.now(UTC)
    rows = await db.execute(
        text(TEMPLATE_SELECT + " WHERE event_type = :e AND enabled ORDER BY channel, locale"), {"e": event.event_type}
    )
    by_channel: dict[str, list[dict[str, Any]]] = {}
    for t in rows.mappings():
        by_channel.setdefault(t["channel"], []).append(dict(t))
    default_locale = (
        await db.execute(text("SELECT default_locale FROM institutions ORDER BY created_at, id LIMIT 1"))
    ).scalar_one_or_none()
    values = event.payload.get("values") or {}
    urgent = event.payload.get("urgent") is True
    written = 0
    for person_id in recipients:
        person = await _recipient(db, str(person_id))
        if person is None:
            continue
        wanted = [loc for loc in (person["preferred_locale"], default_locale) if loc]
        for channel, templates in by_channel.items():
            template = pick_template(templates, wanted)
            if template is None or await already_sent(db, event.event_id, person["id"], channel):
                continue
            pref = await _preference(db, person["user_id"], channel, event.event_type)
            if pref is not None and not pref["enabled"]:
                result = SendResult("suppressed", OFF)
            elif (
                pref
                and pref["quiet_start"]
                and not urgent
                and in_quiet_hours(pref["quiet_start"], pref["quiet_end"], pref["time_zone"], at)
            ):
                result = SendResult("suppressed", QUIET)
            else:
                subject = render(template["subject"], values, template["locale"]) if template["subject"] else None
                message = OutgoingMessage(
                    tenant_id=event.tenant_id,
                    recipient_person_id=person["id"],
                    channel=channel,
                    locale=template["locale"],
                    template_id=template["id"],
                    subject=subject,
                    body=render(template["body"], values, template["locale"]),
                )
                result = await channels[channel].send(message)
            written += await _record(db, event, template, person["id"], result)
    return written
