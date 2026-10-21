"""
Notification & Alert Engine (Build Spec §3.2).
- WHO: explicit user ids from a recipient resolver.
- HOW: channels by severity; per-user preferences respected except mandatory categories / CRITICAL.
- HOW URGENT: INFO | ACTION | WARNING | CRITICAL.
- HOW OFTEN: throttle_key + throttle_hours suppresses repeats per user.
- Channels without a configured provider are recorded as `skipped` (never silently dropped).
- Matching webhook subscriptions get a queued delivery (dispatched by the webhook job).
"""
from datetime import datetime, timezone
from typing import Iterable, Optional

from .audit import audit
from .config import EMAIL_PROVIDER, SMS_PROVIDER

SEVERITIES = ("INFO", "ACTION", "WARNING", "CRITICAL")
MANDATORY_CATEGORIES = {"safety", "financial", "compliance", "security", "academic_record"}
CATEGORIES = ["general", "announcement", "academic", "attendance", "academic_record", "financial", "safety",
              "compliance", "security", "workflow", "library", "placement", "transport", "hostel", "hr", "system"]
SEVERITY_CHANNELS = {
    "INFO": ["in_app"],
    "ACTION": ["in_app", "email"],
    "WARNING": ["in_app", "email"],
    "CRITICAL": ["in_app", "email", "sms"],
}


def _delivery_status(channel: str) -> tuple[str, Optional[str]]:
    if channel == "in_app":
        return "delivered", None
    provider = {"email": EMAIL_PROVIDER, "sms": SMS_PROVIDER}.get(channel, "")
    if provider:
        return "queued", f"Queued for {provider}"
    return "skipped", f"No {channel} provider configured"


async def notify(conn, ctx, *, event_code: str, severity: str, user_ids: Iterable, title: str, body: str = "",
                 link: Optional[str] = None, entity_type: Optional[str] = None, entity_id=None,
                 category: str = "general", throttle_key: Optional[str] = None,
                 throttle_hours: Optional[float] = None, bypass_preferences: bool = False,
                 channels: Optional[list[str]] = None) -> int:
    if severity not in SEVERITIES:
        raise ValueError(f"Unknown severity {severity}")
    ids = list(dict.fromkeys(str(u) for u in user_ids if u))
    if not ids:
        return 0

    if throttle_key and throttle_hours:
        recent = await conn.fetch(
            """SELECT DISTINCT user_id FROM notifications
               WHERE throttle_key = $1 AND user_id = ANY($2::uuid[])
                 AND created_at > now() - make_interval(secs => $3)""",
            throttle_key, ids, float(throttle_hours) * 3600)
        suppressed = {str(r["user_id"]) for r in recent}
        ids = [i for i in ids if i not in suppressed]
        if not ids:
            return 0

    mandatory = bypass_preferences or severity == "CRITICAL" or category in MANDATORY_CATEGORIES
    disabled: dict[str, set] = {}
    if not mandatory:
        for r in await conn.fetch(
                """SELECT user_id, channel FROM notification_preferences
                   WHERE user_id = ANY($1::uuid[]) AND category = $2 AND enabled = false""", ids, category):
            disabled.setdefault(str(r["user_id"]), set()).add(r["channel"])

    wanted = channels or SEVERITY_CHANNELS[severity]
    sent = 0
    for uid in ids:
        user_channels = [c for c in wanted if c not in disabled.get(uid, set())]
        if not user_channels:
            continue
        nid = await conn.fetchval(
            """INSERT INTO notifications (user_id, event_code, severity, category, title, body, link,
                                          entity_type, entity_id, throttle_key, source)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'system') RETURNING id""",
            uid, event_code, severity, category, title, body, link, entity_type,
            str(entity_id) if entity_id is not None else None, throttle_key)
        for channel in user_channels:
            status, response = _delivery_status(channel)
            await conn.execute(
                """INSERT INTO notification_deliveries (notification_id, channel, status, provider_response, attempts)
                   VALUES ($1, $2, $3, $4, 1)""", nid, channel, status, response)
        sent += 1

    await conn.execute(
        """INSERT INTO webhook_deliveries (webhook_id, event_code, payload, status, attempts, next_attempt_at)
           SELECT id, $1, $2::jsonb, 'pending', 0, now() FROM webhooks
           WHERE status = 'active' AND deleted_at IS NULL AND (event_codes ? $1 OR event_codes ? '*')""",
        event_code, {"event_code": event_code, "severity": severity, "title": title,
                     "entity_type": entity_type, "entity_id": str(entity_id) if entity_id else None,
                     "occurred_at": datetime.now(timezone.utc).isoformat()})

    if sent:
        await audit(conn, ctx, "notification.triggered", entity_type, entity_id,
                    after={"event_code": event_code, "severity": severity, "recipients": sent, "channels": wanted})
    return sent
