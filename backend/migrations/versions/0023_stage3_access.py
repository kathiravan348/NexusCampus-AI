"""Add the frozen Stage 3 permission catalogue (NEX-183, D80)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_stage3_access"
down_revision: str | None = "0022_tenant_freeze"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATALOGUE = [
    ("m08.config.read", False, "m08.permission.configRead"),
    ("m08.config.manage", False, "m08.permission.configManage"),
    ("m13.learner.read", False, "m13.permission.learnerRead"),
    ("m13.learner.read_restricted", True, "m13.permission.learnerReadRestricted"),
    ("m13.learner.manage", False, "m13.permission.learnerManage"),
    ("m14.family.read", False, "m14.permission.familyRead"),
    ("m14.family.read_restricted", True, "m14.permission.familyReadRestricted"),
    ("m14.family.manage", False, "m14.permission.familyManage"),
    ("m15.structure.read", False, "m15.permission.structureRead"),
    ("m15.structure.manage", False, "m15.permission.structureManage"),
    ("m09.import.read", False, "m09.permission.importRead"),
    ("m09.import.manage", False, "m09.permission.importManage"),
    ("m12.admissions.read", False, "m12.permission.admissionsRead"),
    ("m12.admissions.manage", False, "m12.permission.admissionsManage"),
    ("m16.timetable.read", False, "m16.permission.timetableRead"),
    ("m16.timetable.manage", False, "m16.permission.timetableManage"),
    ("m17.attendance.read", False, "m17.permission.attendanceRead"),
    ("m17.attendance.mark", True, "m17.permission.attendanceMark"),
    ("m17.leave.decide", True, "m17.permission.leaveDecide"),
    ("m18.fees.read", True, "m18.permission.feesRead"),
    ("m18.fees.manage", True, "m18.permission.feesManage"),
    ("m19.accounts.read", False, "m19.permission.accountsRead"),
    ("m19.accounts.manage", True, "m19.permission.accountsManage"),
    ("m20.marks.read", True, "m20.permission.marksRead"),
    ("m20.marks.enter", True, "m20.permission.marksEnter"),
    ("m21.exams.read", True, "m21.permission.examsRead"),
    ("m21.exams.manage", True, "m21.permission.examsManage"),
    ("m22.reports.read", True, "m22.permission.reportsRead"),
    ("m22.reports.publish", True, "m22.permission.reportsPublish"),
    ("m23.documents.read", True, "m23.permission.documentsRead"),
    ("m23.documents.issue", True, "m23.permission.documentsIssue"),
    ("m24.messages.read", True, "m24.permission.messagesRead"),
    ("m24.messages.send", True, "m24.permission.messagesSend"),
    ("m24.notices.read", False, "m24.permission.noticesRead"),
    ("m24.notices.publish", False, "m24.permission.noticesPublish"),
    ("m24.meetings.read", True, "m24.permission.meetingsRead"),
    ("m24.meetings.manage", True, "m24.permission.meetingsManage"),
    ("m28.dashboards.read", False, "m28.permission.dashboardsRead"),
    ("m86.rollover.read", False, "m86.permission.rolloverRead"),
    ("m86.rollover.manage", False, "m86.permission.rolloverManage"),
]


def upgrade() -> None:
    permissions = sa.table(
        "permissions",
        sa.column("code", sa.String),
        sa.column("module_id", sa.String),
        sa.column("sensitive", sa.Boolean),
        sa.column("description_key", sa.String),
    )
    op.bulk_insert(
        permissions,
        [{"code": c, "module_id": c[:3].upper(), "sensitive": s, "description_key": k} for c, s, k in CATALOGUE],
    )


def downgrade() -> None:
    codes = tuple(code for code, _, _ in CATALOGUE)
    conn = op.get_bind()
    for table, column in (("role_permissions", "permission_code"), ("permissions", "code")):
        rows = sa.table(table, sa.column(column, sa.String))
        conn.execute(rows.delete().where(rows.c[column].in_(codes)))
