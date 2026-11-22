"""`nexus-agent [once | loop --every SECONDS]` (M84, NEX-105): runs only on a self-hosted install
(`NEXUS_INSTALL_MODE=self_hosted`), as the app role. Prints what it found — counts and versions, never people."""

import argparse
import sys
import time

from sqlalchemy import create_engine

from nexus.agent.state import RunResult, run_once
from nexus.core.timing import utf8_console
from nexus.settings import get_settings


def _report(r: RunResult) -> None:
    licence = f"licence problem: {r.licence_problem}" if r.licence_problem else "licence verified"
    update = f"update {r.offer_version} available" if r.offer_version else "no update offered"
    print(f"install: {r.tenants} tenants, {r.learners} learners, {r.campuses} campuses; {licence}; {update}")
    for reason in r.skipped:
        print(f"  not offered: {reason}")


def main() -> None:
    utf8_console()
    p = argparse.ArgumentParser(prog="nexus-agent")
    p.add_argument("mode", choices=["once", "loop"], nargs="?", default="once")
    p.add_argument("--every", type=int, default=3600)
    args = p.parse_args()
    settings = get_settings()
    if settings.install_mode != "self_hosted":
        sys.exit("The install agent runs only on a self-hosted install (NEXUS_INSTALL_MODE=self_hosted).")
    engine = create_engine(settings.database_url.get_secret_value(), pool_pre_ping=True)
    try:
        while True:
            with engine.begin() as conn:
                _report(run_once(conn, settings))
            if args.mode == "once":
                return
            time.sleep(max(60, args.every))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
