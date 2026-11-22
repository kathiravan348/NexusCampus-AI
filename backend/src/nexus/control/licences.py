"""P05 licences on the control database (NEX-103), with files really signed in OpenBao (Ed25519, NEX-095).

A licence row holds the terms, our state, the fingerprint and the signature of its current file. The file is the
terms + signature (`nexus-licence/1`); installs verify it offline (D23). Terms and signature only ever change
together, in one transaction, so a stored signature always matches its row.
"""

from datetime import UTC, date, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    false,
    select,
    update,
)

from nexus.control.accounts import accounts
from nexus.control.resources import CamelModel, Resource, engine_of, get_one, mount
from nexus.control.settings import ControlSettings
from nexus.control.staff import metadata, utc_text
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError
from nexus.core.vault import Vault
from nexus.licensing.licence import LicenceFile, LicenceTerms, fingerprint, issue_licence

ID = 64

licences = Table(
    "licences",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("edition", String(16), nullable=False),
    Column("modules", ARRAY(Text), nullable=False),
    Column("learner_cap", Integer, nullable=False),
    Column("campus_cap", Integer, nullable=False),
    Column("issued_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", Date, nullable=True),
    Column("support_ends_at", Date, nullable=False),
    Column("grace_days", Integer, nullable=False),
    Column("activation", String(8), nullable=False),
    Column("signing_key_id", String(64), nullable=False),
    Column("state", String(16), nullable=False),
    Column("fingerprint", String(64), nullable=False),
    Column("deployment_id", String(ID), nullable=True),
    #: Base64 Ed25519 signature of the current file; null until the file is first signed (seeded demo rows).
    Column("signature", String(88), nullable=True),
    Column("signed", Boolean, nullable=False, server_default=false()),
    CheckConstraint("signed = (signature IS NOT NULL)", name="licences_signed_iff_signature"),
    CheckConstraint("expires_at IS NULL OR expires_at >= issued_at::date", name="licences_expiry_after_issue"),
    CheckConstraint(
        "expires_at IS NOT NULL OR state NOT IN ('grace', 'expired')", name="licences_perpetual_never_expires"
    ),
)


class Licence(CamelModel):
    id: str
    account_id: str
    edition: Literal["standard", "enterprise"]
    modules: list[str]
    learner_cap: int
    campus_cap: int
    issued_at: str
    expires_at: str | None
    support_ends_at: str
    grace_days: int
    activation: Literal["online", "offline"]
    signing_key_id: str
    state: Literal["active", "grace", "read_only", "expired", "revoked"]
    fingerprint: str
    deployment_id: str | None


SEED_TABLES: list[tuple[str, Table, type[CamelModel], str]] = [("licences", licences, Licence, "id")]

router = APIRouter(prefix="/control/api/v1", tags=["P05 licences"])
LICENCES = Resource(
    "licences",
    licences,
    Licence,
    "ctl.licence.read",
    {"accountId": "account_id", "state": "state", "edition": "edition"},
)
mount(router, LICENCES)
Issuer = Annotated[Viewer, Depends(require("ctl.licence.issue"))]


def _terms(licence: Licence, key_id: str) -> LicenceTerms:
    return LicenceTerms.model_validate(
        {
            "id": licence.id,
            "accountId": licence.account_id,
            "edition": licence.edition,
            "modules": licence.modules,
            "learnerCap": licence.learner_cap,
            "campusCap": licence.campus_cap,
            "issuedAt": licence.issued_at,
            "expiresAt": licence.expires_at,
            "supportEndsAt": licence.support_ends_at,
            "graceDays": licence.grace_days,
            "activation": licence.activation,
            "signingKeyId": key_id,
        }
    )


def _file(licence: Licence, signature: str) -> LicenceFile:
    return LicenceFile(payload=_terms(licence, licence.signing_key_id), signature=signature)


def plus_year(value: str) -> str:
    """`YYYY-MM-DD` one year later (29 Feb → 28 Feb), as the mocks."""
    d = date.fromisoformat(value)
    try:
        return d.replace(year=d.year + 1).isoformat()
    except ValueError:
        return d.replace(year=d.year + 1, day=28).isoformat()


async def _sign_and_store(request: Request, licence: Licence, expect_signed: bool) -> tuple[Licence, LicenceFile]:
    """Signs `licence` with the newest key version and stores terms + signature together (optimistic check)."""
    vault: Vault = request.app.state.vault
    settings: ControlSettings = request.app.state.settings
    file = await issue_licence(_terms(licence, "pending"), vault, settings.licence_signing_key)
    signed = licence.model_copy(
        update={"signing_key_id": file.payload.signing_key_id, "fingerprint": fingerprint(file)}
    )
    async with engine_of(request).begin() as conn:
        done = await conn.execute(
            update(licences)
            .where(licences.c.id == licence.id, licences.c.signed.is_(expect_signed))
            .values(
                issued_at=datetime.fromisoformat(signed.issued_at.replace("Z", "+00:00")),
                expires_at=date.fromisoformat(signed.expires_at) if signed.expires_at else None,
                support_ends_at=date.fromisoformat(signed.support_ends_at),
                state=signed.state,
                signing_key_id=signed.signing_key_id,
                fingerprint=signed.fingerprint,
                signature=file.signature,
                signed=True,
            )
        )
        if done.rowcount != 1:
            raise ApiError(409, "conflict", "The licence changed meanwhile; try again.")
    return signed, file


@router.get("/licence-files/{licence_id}")
async def licence_file(request: Request, viewer: Issuer, licence_id: str) -> Any:
    """The signed file an install loads. A licence that has no signed file yet is signed now."""
    licence = await get_one(request, LICENCES, viewer, licence_id)
    assert isinstance(licence, Licence)
    async with engine_of(request).connect() as conn:
        row = (await conn.execute(select(licences.c.signature).where(licences.c.id == licence_id))).one()
    if row.signature:
        file = _file(licence, row.signature)
    else:
        _, file = await _sign_and_store(request, licence, expect_signed=False)
    return file.model_dump(by_alias=True)


@router.post("/licences/{licence_id}/renew", response_model=Licence)
async def renew(request: Request, viewer: Issuer, licence_id: str) -> Any:
    """One more year of licence and support; a new signed file replaces the old one. Revoked → 409."""
    licence = await get_one(request, LICENCES, viewer, licence_id)
    assert isinstance(licence, Licence)
    if licence.state == "revoked":
        raise ApiError(409, "conflict", "A revoked licence cannot be renewed.")
    async with engine_of(request).connect() as conn:
        was_signed = bool((await conn.execute(select(licences.c.signed).where(licences.c.id == licence_id))).scalar())
    renewed = licence.model_copy(
        update={
            "issued_at": utc_text(datetime.now(UTC)),
            "expires_at": plus_year(licence.expires_at) if licence.expires_at else None,
            "support_ends_at": plus_year(licence.support_ends_at),
            "state": "active",
        }
    )
    signed, _ = await _sign_and_store(request, renewed, expect_signed=was_signed)
    return signed


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo licences (unsigned: their file is signed on first download)."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from nexus.control.rows import to_db

    count = 0
    for raw in data.get("licences", []):
        row = to_db(licences, Licence.model_validate(raw).model_dump())
        stmt = pg_insert(licences).values(row)
        conn.execute(stmt.on_conflict_do_nothing(index_elements=["id"]))
        count += 1
    return count
