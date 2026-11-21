"""Signed audit checkpoints (NEX-065, ARCHITECTURE §6).

Once a day the checkpoint job signs each tenant's audit chain head with an Ed25519 key that lives in Vault Transit
(`CHECKPOINT_KEY`, never exported). The signed message names the tenant, the day, the head's sequence number and
its hash:

    nexus-audit-checkpoint|v1|<tenantId>|<YYYY-MM-DD>|<headSeq>|<headHash>

Before signing, the job re-verifies the chain segment since the previous checkpoint and refuses to sign a broken
chain. Verification (`verify_checkpoints`) recomputes the whole chain and checks every checkpoint's signature and
that the audit row at its `headSeq` still has the signed hash. So:

- editing any audit row breaks its recomputed hash (chain check);
- rewriting the chain with fresh hashes changes the hash at a checkpoint's `headSeq` (head check);
- editing a checkpoint row to match breaks its signature (signature check).

Rows written after the latest checkpoint are protected by the chain links alone until the next checkpoint.
Checkpoint rows hold ids, counts and hashes only — never personal data.
"""

import argparse
import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime

import httpx2
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from nexus.core import db
from nexus.core.audit import AuditInput, record_audit
from nexus.core.errors import ApiError
from nexus.core.hashchain import ChainCheck, verify_chain
from nexus.core.ids import new_id
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault, Vault
from nexus.settings import Settings, get_settings

log = logging.getLogger("nexus.checkpoints")
CHECKPOINT_KEY = "nexus-audit-checkpoints"
_COLUMNS = "id, tenant_id, day, head_seq, head_hash, signature, key_name, signed_at"


class ChainBroken(Exception):
    """The chain segment to be signed does not verify: nothing is signed."""

    def __init__(self, tenant_id: str, event_id: str | None) -> None:
        super().__init__(f"audit chain of {tenant_id} is broken at {event_id}")
        self.tenant_id = tenant_id
        self.event_id = event_id


@dataclass(frozen=True)
class Checkpoint:
    id: str
    tenant_id: str
    day: date
    head_seq: int
    head_hash: str
    signature: str
    key_name: str
    signed_at: datetime


@dataclass(frozen=True)
class CheckpointCheck:
    checkpoint: Checkpoint
    signature_valid: bool
    head_matches: bool

    @property
    def ok(self) -> bool:
        return self.signature_valid and self.head_matches


@dataclass(frozen=True)
class CheckpointReport:
    chain: ChainCheck
    checkpoints: list[CheckpointCheck]

    @property
    def ok(self) -> bool:
        return self.chain.ok and all(c.ok for c in self.checkpoints)


def checkpoint_message(tenant_id: str, day: date, head_seq: int, head_hash: str) -> bytes:
    return f"nexus-audit-checkpoint|v1|{tenant_id}|{day.isoformat()}|{head_seq}|{head_hash}".encode()


def _checkpoint(row: dict[str, object]) -> Checkpoint:
    return Checkpoint(**row)  # type: ignore[arg-type]


async def list_checkpoints(session: AsyncSession) -> list[Checkpoint]:
    """The bound tenant's checkpoints, oldest first."""
    rows = await session.execute(text(f"SELECT {_COLUMNS} FROM audit_checkpoints ORDER BY head_seq, day"))  # noqa: S608
    return [_checkpoint(dict(r)) for r in rows.mappings().all()]


async def create_checkpoint(
    session: AsyncSession, vault: Vault, ctx: TenantContext, day: date
) -> tuple[Checkpoint | None, bool]:
    """Signs `ctx`'s chain head for `day` in the caller's tenant transaction: `(checkpoint, created)`.

    Idempotent per day (an existing checkpoint is returned); `(None, False)` when the tenant has no audit events.
    Raises `ChainBroken` (and signs nothing) when the segment since the previous checkpoint does not verify.
    """
    existing = await session.execute(
        text(f"SELECT {_COLUMNS} FROM audit_checkpoints WHERE day = :d"),  # noqa: S608
        {"d": day},
    )
    if (found := existing.mappings().first()) is not None:
        return _checkpoint(dict(found)), False
    head = (await session.execute(text("SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1"))).first()
    if head is None:
        return None, False
    head_seq, head_hash = int(head[0]), str(head[1])
    previous = (
        await session.execute(text("SELECT head_seq, head_hash FROM audit_checkpoints ORDER BY head_seq DESC LIMIT 1"))
    ).first()
    from_seq = int(previous[0]) + 1 if previous else 1
    if from_seq <= head_seq:
        check = await verify_chain(session, ctx.tenant_id, from_seq, head_seq)
        if not check.ok:
            raise ChainBroken(ctx.tenant_id, check.broken_at)
        if previous is not None:  # the segment must hang off the previously signed head
            first = (
                await session.execute(text("SELECT id, prev_hash FROM audit_events WHERE seq = :s"), {"s": from_seq})
            ).one()
            if first[1] != previous[1]:
                raise ChainBroken(ctx.tenant_id, str(first[0]))
    else:  # no new events: the row at the signed head must still carry the signed hash
        if int(previous[0]) != head_seq or str(previous[1]) != head_hash:  # type: ignore[index]
            raise ChainBroken(ctx.tenant_id, None)
    signature = await vault.sign(CHECKPOINT_KEY, checkpoint_message(ctx.tenant_id, day, head_seq, head_hash))
    checkpoint = Checkpoint(
        id=new_id("ack"),
        tenant_id=ctx.tenant_id,
        day=day,
        head_seq=head_seq,
        head_hash=head_hash,
        signature=signature,
        key_name=CHECKPOINT_KEY,
        signed_at=datetime.now(UTC),
    )
    await session.execute(
        text(
            "INSERT INTO audit_checkpoints (id, tenant_id, day, head_seq, head_hash, signature, key_name, signed_at) "
            "VALUES (:id, :t, :d, :s, :h, :sig, :k, :at)"
        ),
        {
            "id": checkpoint.id,
            "t": checkpoint.tenant_id,
            "d": day,
            "s": head_seq,
            "h": head_hash,
            "sig": signature,
            "k": checkpoint.key_name,
            "at": checkpoint.signed_at,
        },
    )
    await record_audit(
        session,
        ctx,
        AuditInput(
            action="m06.auditCheckpoint.signed",
            actor_kind="system",
            target_type="auditCheckpoint",
            target_id=checkpoint.id,
        ),
    )
    return checkpoint, True


async def verify_checkpoints(session: AsyncSession, vault: Vault, tenant_id: str) -> CheckpointReport:
    """Recomputes the bound tenant's whole chain and checks every checkpoint against it."""
    chain = await verify_chain(session, tenant_id)
    joined = await session.execute(
        text("SELECT a.seq, a.hash FROM audit_events a JOIN audit_checkpoints c ON c.head_seq = a.seq")
    )
    hashes: dict[int, str] = {int(seq): str(digest) for seq, digest in joined.all()}
    checks = []
    for cp in await list_checkpoints(session):
        message = checkpoint_message(cp.tenant_id, cp.day, cp.head_seq, cp.head_hash)
        valid = cp.tenant_id == tenant_id and await vault.verify(cp.key_name, message, cp.signature)
        checks.append(CheckpointCheck(cp, valid, hashes.get(cp.head_seq) == cp.head_hash))
    return CheckpointReport(chain, checks)


async def checkpoint_all(
    sessions: async_sessionmaker[AsyncSession], settings: Settings, vault: Vault, day: date
) -> tuple[int, int]:
    """One checkpoint for `day` per tenant with an audit chain: `(signed, refused)`. Idempotent."""
    await vault.create_signing_key(CHECKPOINT_KEY)
    async with sessions() as session:
        tenants = list((await session.execute(text("SELECT * FROM nexus_audit_tenants()"))).scalars())
    signed = refused = 0
    for tenant_id in tenants:
        try:
            async with tenant_transaction(sessions, TenantContext(tenant_id), settings) as session:
                _, created = await create_checkpoint(session, vault, TenantContext(tenant_id), day)
            signed += int(created)
        except ChainBroken as exc:
            refused += 1
            log.error("audit chain of tenant %s does not verify (event %s): not signed", tenant_id, exc.event_id)
        except ApiError:  # a tenant of another region: signed by its own cell
            log.info("tenant %s skipped: not served by this cell", tenant_id)
        except Exception:
            log.exception("tenant %s skipped", tenant_id)
    return signed, refused


async def _main() -> None:
    settings = get_settings()
    db.init_engine(settings)
    async with httpx2.AsyncClient(timeout=10.0) as http:
        try:
            signed, refused = await checkpoint_all(db.sessionmaker(), settings, HttpVault(settings, http), _today())
            log.info("audit checkpoints: %d signed, %d refused", signed, refused)
        finally:
            await db.dispose_engine()


def _today() -> date:
    return datetime.now(UTC).date()


def main() -> None:
    """`nexus-checkpoints`: sign today's checkpoint for every tenant (the worker also does this once a day)."""
    utf8_console()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    argparse.ArgumentParser(description="Sign today's audit chain checkpoints.").parse_args()
    asyncio.run(_main(), loop_factory=asyncio.SelectorEventLoop)
