"""`uv run --project backend nexus-control-agent-token <deployment-id> [--revoke]`: issues or revokes a
per-deployment agent bearer token on the control database (owner connection, NEX-113).

The token is printed once on issue and never stored in clear (only `sha256(token)` in `deployment_agent_tokens`).
Re-issuing replaces any previous token (and clears `revoked_at`).
"""

import argparse
import secrets
import sys
from datetime import UTC, datetime

from sqlalchemy import create_engine, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.fleet import deployment_agent_tokens, deployments, hash_token
from nexus.control.settings import get_control_settings
from nexus.core.timing import utf8_console


def issue_token(owner_url: str, deployment_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    digest = hash_token(token)
    engine = create_engine(owner_url)
    try:
        with engine.begin() as conn:
            exists = conn.execute(select(deployments.c.id).where(deployments.c.id == deployment_id)).first()
            if exists is None:
                raise ValueError(f"Unknown deployment: {deployment_id}")
            stmt = pg_insert(deployment_agent_tokens).values(
                deployment_id=deployment_id,
                token_sha256=digest,
                created_at=now,
                revoked_at=None,
            )
            conn.execute(
                stmt.on_conflict_do_update(
                    index_elements=["deployment_id"],
                    set_={"token_sha256": digest, "created_at": now, "revoked_at": None},
                )
            )
    finally:
        engine.dispose()
    return token


def revoke_token(owner_url: str, deployment_id: str) -> bool:
    engine = create_engine(owner_url)
    try:
        with engine.begin() as conn:
            done = conn.execute(
                update(deployment_agent_tokens)
                .where(
                    deployment_agent_tokens.c.deployment_id == deployment_id,
                    deployment_agent_tokens.c.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(UTC))
            )
            return done.rowcount == 1
    finally:
        engine.dispose()


def main(argv: list[str] | None = None) -> None:
    utf8_console()
    parser = argparse.ArgumentParser(prog="nexus-control-agent-token")
    parser.add_argument("deployment_id", help="Deployment id (e.g. dep-ct)")
    parser.add_argument("--revoke", action="store_true", help="Revoke the deployment's current agent token")
    args = parser.parse_args(argv)

    owner_url = get_control_settings().owner_url()
    if args.revoke:
        revoked = revoke_token(owner_url, args.deployment_id)
        print(f"revoked: {args.deployment_id}" if revoked else f"no active token: {args.deployment_id}")
        return
    try:
        print(issue_token(owner_url, args.deployment_id))
    except ValueError as exc:
        sys.exit(str(exc))


if __name__ == "__main__":
    main()
