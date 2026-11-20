"""M10 Sync centre API (NEX-057, O-2/O-3): device registry, register + heartbeat, remote wipe, conflicts.

Devices, conflicts, revoke and resolve behave as the mock (`handlers/m10.ts`). Remote wipe: an admin's revoke sets
`revoke_pending` and counts the pending writes as lost; the device's next heartbeat is answered `wipe` and the
device becomes `revoked`; any later heartbeat → `401`. Both steps are audited. Writes are replayed safely with
`Idempotency-Key` (`core/idempotency.py`).
"""

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Header
from pydantic import Field, StringConstraints
from sqlalchemy import text

from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.schemas import Contract
from nexus.modules.m10.service import CONFLICT_SELECT, DEVICE_SELECT, ConflictOut, DeviceOut, audit, device_out, visible

router = APIRouter(prefix="/api/v1", tags=["m10 sync centre"])
Reader = Annotated[Authorized, Depends(require("m10.device.read", "M10"), scope="function")]
Wiper = Annotated[Authorized, Depends(require("m10.device.wipe", "M10"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
JsonBody = Annotated[Any, Body()]
DeviceHeader = Annotated[str | None, Header(alias="X-Device-Id")]


class RegisterIn(Contract):
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    platform: Literal["web", "android", "ios", "edge"]


class HeartbeatIn(Contract):
    pending_count: int = Field(ge=0, le=1_000_000)


class HeartbeatOut(Contract):
    action: Literal["sync", "wipe"]
    device: DeviceOut


class RevokeIn(Contract):
    #: Required (true) when the device being revoked is the caller's current device (the screen's second confirm).
    confirm_own_device: bool = False


class ResolveIn(Contract):
    resolution: Literal["keep_server", "keep_client", "merged"]


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def _conflict(path: str, message: str) -> ApiError:
    return ApiError(409, "conflict", message, [ApiErrorDetail(path=path, message=message)])


@router.get("/devices", response_model=Page[DeviceOut])
async def devices(auth: Reader, page: Paging) -> Page[DeviceOut]:
    where, params = visible(auth)
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM devices" + where), params)).scalar_one()  # noqa: S608
    rows = await db.execute(
        text(DEVICE_SELECT + where + " ORDER BY label, id LIMIT :n OFFSET :o"),
        {**params, "n": page.page_size, "o": page.offset},
    )
    return Page.of([DeviceOut.model_validate(dict(r)) for r in rows.mappings()], int(total), page)


@router.get("/sync-conflicts", response_model=Page[ConflictOut])
async def conflicts(auth: Reader, page: Paging) -> Page[ConflictOut]:
    """Conflicts of the devices the caller can see (no payloads)."""
    where, params = visible(auth)
    scope = f" WHERE device_id IN (SELECT id FROM devices{where})"  # noqa: S608 (fixed fragments only)
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM sync_conflicts" + scope), params)).scalar_one()  # noqa: S608
    rows = await db.execute(
        text(CONFLICT_SELECT + scope + " ORDER BY created_at DESC, id LIMIT :n OFFSET :o"),
        {**params, "n": page.page_size, "o": page.offset},
    )
    return Page.of([ConflictOut.model_validate(dict(r)) for r in rows.mappings()], int(total), page)


@router.post("/devices", status_code=201, response_model=DeviceOut)
async def register(auth: Reader, body: JsonBody) -> DeviceOut:
    """Registers the caller's device (the app calls this once per install)."""
    data = parse_body(RegisterIn, body)
    device_id = new_id("dev")
    await auth.ctx.db.execute(
        text(
            "INSERT INTO devices (id, tenant_id, user_id, label, platform, status) "
            "VALUES (:id, :t, :u, :l, :p, 'active')"
        ),
        {"id": device_id, "t": auth.ctx.tenant.tenant_id, "u": auth.ctx.user_id, "l": data.label, "p": data.platform},
    )
    await audit(
        auth.ctx.db, auth.ctx.tenant, auth.ctx.user_id, "m10.device.registered", ("device", device_id), ["label"]
    )
    created = await device_out(auth.ctx.db, device_id)
    assert created is not None
    return created


@router.post("/devices/{device_id}/heartbeat", response_model=HeartbeatOut)
async def heartbeat(device_id: str, auth: Reader, body: JsonBody) -> HeartbeatOut:
    """The device's check-in: `sync`, or `wipe` once after a revoke; a revoked device is refused (401)."""
    db = auth.ctx.db
    device = await device_out(db, device_id)
    if device is None or device.user_id != auth.ctx.user_id:
        raise _not_found()
    if device.status == "revoked":
        raise ApiError(401, "unauthorized", "This device was removed. Sign in again on a new install.")
    data = parse_body(HeartbeatIn, body)
    now = datetime.now(UTC)
    if device.status == "revoke_pending":
        await db.execute(
            text(
                "UPDATE devices SET status = 'revoked', revoked_at = :now, last_sync_at = :now, "
                "lost_write_count = lost_write_count + :lost, pending_count = 0 WHERE id = :id"
            ),
            {"now": now, "lost": data.pending_count, "id": device_id},
        )
        await audit(db, auth.ctx.tenant, auth.ctx.user_id, "m10.device.wiped", ("device", device_id), ["status"])
        action: Literal["sync", "wipe"] = "wipe"
    else:
        await db.execute(
            text("UPDATE devices SET last_sync_at = :now, pending_count = :p WHERE id = :id"),
            {"now": now, "p": data.pending_count, "id": device_id},
        )
        action = "sync"
    updated = await device_out(db, device_id)
    assert updated is not None
    return HeartbeatOut(action=action, device=updated)


@router.post("/devices/{device_id}/revoke", response_model=DeviceOut)
async def revoke(device_id: str, auth: Wiper, body: JsonBody, current_device: DeviceHeader = None) -> DeviceOut:
    """Remote wipe request (O-3): `active` → `revoke_pending`; pending writes become lost writes."""
    db = auth.ctx.db
    await db.execute(text("SELECT 1 FROM devices WHERE id = :id FOR UPDATE"), {"id": device_id})
    device = await device_out(db, device_id)
    if device is None:
        raise _not_found()
    data = parse_body(RevokeIn, body if body is not None else {})
    if device.status != "active":
        raise _conflict("status", f"Device is {device.status}")
    if current_device == device_id and not data.confirm_own_device:
        raise _conflict("confirmOwnDevice", "This is the device you are using; confirm a second time")
    await db.execute(
        text(
            "UPDATE devices SET status = 'revoke_pending', lost_write_count = lost_write_count + pending_count, "
            "pending_count = 0 WHERE id = :id"
        ),
        {"id": device_id},
    )
    await audit(db, auth.ctx.tenant, auth.ctx.user_id, "m10.device.revokeRequested", ("device", device_id), ["status"])
    updated = await device_out(db, device_id)
    assert updated is not None
    return updated


@router.post("/sync-conflicts/{conflict_id}/resolve", response_model=ConflictOut)
async def resolve(conflict_id: str, auth: Wiper, body: JsonBody) -> ConflictOut:
    """Resolve a conflict; its device's open-conflict count drops by one. Already resolved → 409."""
    data = parse_body(ResolveIn, body)
    db = auth.ctx.db
    row = (
        (await db.execute(text(CONFLICT_SELECT + " WHERE id = :id FOR UPDATE"), {"id": conflict_id})).mappings().first()
    )
    if row is None:
        raise _not_found()
    if row["status"] == "resolved":
        raise _conflict("status", "Already resolved")
    now = datetime.now(UTC)
    await db.execute(
        text("UPDATE sync_conflicts SET status = 'resolved', resolution = :r, resolved_at = :now WHERE id = :id"),
        {"r": data.resolution, "now": now, "id": conflict_id},
    )
    await db.execute(
        text("UPDATE devices SET conflict_count = greatest(conflict_count - 1, 0) WHERE id = :d"),
        {"d": row["device_id"]},
    )
    fields = ["status", "resolution"]
    await audit(db, auth.ctx.tenant, auth.ctx.user_id, "m10.conflict.resolved", ("syncConflict", conflict_id), fields)
    return ConflictOut.model_validate(
        {**dict(row), "status": "resolved", "resolution": data.resolution, "resolved_at": now}
    )
