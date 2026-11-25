"""Stage 3 demo rows (NEX-195, D85): the mock fixtures of M08, M09, M12-M24 and M86 into the database.

Rows are upserted by id, tenant by tenant inside the tenant's RLS scope. Field names map camelCase → snake_case onto
each table's columns (other contract fields are derived on read and dropped here). Every column listed in
`ENCRYPTED_COLUMNS` is sealed with the production `FieldCipher` under the tenant's key, so no plaintext personal data
is written and tenant export can read the rows. A few tables store a contract field differently; small hooks split
or seal those (learner custom fields and health flags, application answers, report card remarks, rollover counts).
"""

import asyncio
import json
import re
from collections.abc import Callable
from typing import Any

from sqlalchemy import Connection, text

from nexus.agent.tenant_export import ENCRYPTED_COLUMNS
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.vault import key_name

#: (fixture key, table) in insert order (parents first).
STAGE3_TABLES: tuple[tuple[str, str], ...] = (
    ("nextYearCalendars", "academic_calendars"),
    ("customFieldDefinitions", "custom_field_definitions"),
    ("formDefinitions", "form_definitions"),
    ("workflowDefinitions", "workflow_definitions"),
    ("numberingFormats", "numbering_formats"),
    ("programs", "programs"),
    ("yearLevels", "year_levels"),
    ("classGroups", "class_groups"),
    ("subjects", "subjects"),
    ("subjectOfferings", "subject_offerings"),
    ("learners", "learners"),
    ("enrolments", "enrolments"),
    ("learnerDocuments", "learner_documents"),
    ("households", "households"),
    ("guardianRelationships", "guardian_relationships"),
    ("authorisedPickups", "authorised_pickups"),
    ("enquiries", "enquiries"),
    ("applications", "applications"),
    ("admissionOffers", "admission_offers"),
    ("waitlistEntries", "waitlist_entries"),
    ("enquiryForms", "enquiry_forms"),
    ("importJobs", "import_jobs"),
    ("columnMappings", "column_mappings"),
    ("importRowIssues", "import_row_issues"),
    ("rooms", "rooms"),
    ("bellSchedules", "bell_schedules"),
    ("timetableSlots", "timetable_slots"),
    ("attendanceSessions", "attendance_sessions"),
    ("attendanceMarks", "attendance_marks"),
    ("leaveRequests", "leave_requests"),
    ("feeHeads", "fee_heads"),
    ("feePlans", "fee_plans"),
    ("concessions", "concessions"),
    ("feeInvoices", "fee_invoices"),
    ("feePayments", "fee_payments"),
    ("feeRefunds", "fee_refunds"),
    ("ledgerAccounts", "ledger_accounts"),
    ("journalEntries", "journal_entries"),
    ("budgets", "budgets"),
    ("gradingSchemes", "grading_schemes"),
    ("rubrics", "rubrics"),
    ("assessments", "assessments"),
    ("markEntries", "mark_entries"),
    ("exams", "exams"),
    ("examPapers", "exam_papers"),
    ("seatAssignments", "seat_assignments"),
    ("hallTickets", "hall_tickets"),
    ("revaluationRequests", "revaluation_requests"),
    ("reportCards", "report_cards"),
    ("issuedDocuments", "issued_documents"),
    ("messageThreads", "message_threads"),
    ("threadMessages", "thread_messages"),
    ("notices", "notices"),
    ("meetingSlots", "meeting_slots"),
    ("meetingBookings", "meeting_bookings"),
    ("rolloverRuns", "rollover_runs"),
    ("promotionDecisions", "promotion_decisions"),
)
#: Children first, for `--reset` (the next-year calendars go with the other calendars).
STAGE3_TABLES_CHILD_FIRST = tuple(table for _, table in reversed(STAGE3_TABLES) if table != "academic_calendars")
_CAMEL = re.compile(r"(?<!^)(?=[A-Z])")
_JSON = {"json", "jsonb"}

Row = dict[str, Any]


def _snake(key: str) -> str:
    return _CAMEL.sub("_", key).lower()


def _columns(conn: Connection, table: str) -> dict[str, str]:
    rows = conn.execute(
        text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :t"), {"t": table}
    )
    return {row.column_name: row.data_type for row in rows}


def _sensitive_keys(data: dict[str, Any], tenant_id: str, entity: str) -> set[str]:
    return {
        row["key"]
        for row in data.get("customFieldDefinitions", [])
        if row["tenantId"] == tenant_id and row["entity"] == entity and row.get("sensitive")
    }


def _learner(data: dict[str, Any], row: Row) -> Row:
    private = _sensitive_keys(data, row["tenantId"], "learner")
    fields = dict(row.get("customFields") or {})
    flags = row.get("healthFlags") or []
    return {
        **row,
        "customFields": {k: v for k, v in fields.items() if k not in private},
        "sensitiveCustomFields": {k: v for k, v in fields.items() if k in private} or None,
        "healthFlags": flags or None,
    }


def _application(data: dict[str, Any], row: Row) -> Row:
    private = _sensitive_keys(data, row["tenantId"], "application")
    answers = dict(row.get("answers") or {})
    return {
        **row,
        "answers": {k: v for k, v in answers.items() if k not in private},
        "sensitiveAnswers": {k: v for k, v in answers.items() if k in private} or None,
    }


def _report_card(data: dict[str, Any], row: Row) -> Row:
    lines = list(row.get("lines") or [])
    remarks = [line.get("remark") for line in lines]
    return {
        **row,
        "lines": [{k: v for k, v in line.items() if k != "remark"} for line in lines],
        "lineRemarks": remarks if any(remark is not None for remark in remarks) else None,
    }


def _rollover_run(data: dict[str, Any], row: Row) -> Row:
    counts = row.get("counts") or {}
    return {**row, **{f"{action}Count": counts.get(action, 0) for action in counts}}


HOOKS: dict[str, Callable[[dict[str, Any], Row], Row]] = {
    "learners": _learner,
    "applications": _application,
    "report_cards": _report_card,
    "rollover_runs": _rollover_run,
}


class Sealer:
    """Seals one value with the production `FieldCipher` (sync wrapper for the seed's sync connection)."""

    def __init__(self, cipher: FieldCipher) -> None:
        self._cipher = cipher
        # One loop for the whole seed: an HTTP key-service client must not move between event loops.
        self._loop = asyncio.new_event_loop()

    def close(self) -> None:
        self._loop.close()

    def seal(self, tenant_id: str, table: str, column: str, value: Any) -> Any:
        spec = ENCRYPTED_COLUMNS.get((table, column))
        if spec is None or value is None:
            return value
        plain = value if isinstance(value, str) else json.dumps(value)
        return self._loop.run_until_complete(self._cipher.encrypt(key_name(tenant_id, spec.purpose), spec.field, plain))


def _upsert(conn: Connection, table: str, columns: dict[str, str], row: Row) -> None:
    names = list(row)
    key = "job_id" if table == "column_mappings" else "id"
    quoted = ", ".join(f'"{n}"' for n in names)
    values = ", ".join(f"CAST(:{n} AS jsonb)" if columns[n] in _JSON else f":{n}" for n in names)
    updates = ", ".join(f'"{n}" = EXCLUDED."{n}"' for n in names if n != key)
    conn.execute(
        text(f"INSERT INTO {table} ({quoted}) VALUES ({values}) ON CONFLICT ({key}) DO UPDATE SET {updates}"),  # noqa: S608
        {n: json.dumps(v) if columns[n] in _JSON and v is not None else v for n, v in row.items()},
    )


def seed_stage3(conn: Connection, data: dict[str, Any], tenant_id: str, sealer: Sealer) -> dict[str, int]:
    """Writes one tenant's Stage 3 rows (inside its RLS scope). Returns rows written per table."""
    counts: dict[str, int] = {}
    for key, table in STAGE3_TABLES:
        rows = [row for row in data.get(key, []) if row.get("tenantId") == tenant_id]
        if not rows:
            continue
        columns = _columns(conn, table)
        hook = HOOKS.get(table)
        for raw in rows:
            shaped = hook(data, raw) if hook else raw
            record = {_snake(k): v for k, v in shaped.items()}
            record = {
                name: sealer.seal(tenant_id, table, name, value) for name, value in record.items() if name in columns
            }
            _upsert(conn, table, columns, record)
        counts[table] = counts.get(table, 0) + len(rows)
    return counts
