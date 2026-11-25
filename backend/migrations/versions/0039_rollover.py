"""Year-end rollover (M86, NEX-193, D84): runs and promotion decisions, plus the narrow grants to apply and reverse.

A decision keeps the learner's previous enrolment, the enrolment it created and the learner's previous status and
leaving date (internal columns, never returned), so a roll-back inside the window restores everything exactly.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0039_rollover"
down_revision: str | None = "0038_communication"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("rollover_runs", "promotion_decisions")
ACTIONS = "('promote','detain','graduate','transfer','skip')"
COUNTS = ("promote_count", "detain_count", "graduate_count", "transfer_count", "skip_count")
REASON = "reason_key ~ '^(common|term|[mp][0-9]{2})[.][a-z][A-Za-z0-9]*([.][a-z][A-Za-z0-9]*)*$'"


def upgrade() -> None:
    op.create_table(
        "rollover_runs",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("from_academic_year_id", sa.String(ID), nullable=False),
        sa.Column("to_academic_year_id", sa.String(ID), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        *[sa.Column(name, sa.Integer(), nullable=False) for name in COUNTS],
        sa.Column("carry_forward_fees", sa.Boolean(), nullable=False),
        sa.Column("rollback_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_staff_profile_id", sa.String(ID), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["from_academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        sa.ForeignKeyConstraint(
            ["to_academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        sa.ForeignKeyConstraint(
            ["created_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.UniqueConstraint("id", "tenant_id", name="uq_rollover_runs_ref_tenant"),
        sa.CheckConstraint("to_academic_year_id <> from_academic_year_id", name="years_differ"),
        sa.CheckConstraint(
            "status IN ('draft','dry_run_ready','running','completed','rolled_back','failed')", name="status_valid"
        ),
        sa.CheckConstraint(" AND ".join(f"{name} >= 0" for name in COUNTS), name="counts_valid"),
        sa.CheckConstraint("(rollback_until IS NOT NULL) = (status = 'completed')", name="window_iff_completed"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    # One open run per institution and from-year (D84).
    op.create_index(
        "uq_rollover_runs_open",
        "rollover_runs",
        ["tenant_id", "institution_id", "from_academic_year_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('draft','dry_run_ready','running')"),
    )
    op.create_table(
        "promotion_decisions",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("run_id", sa.String(ID), nullable=False),
        sa.Column("learner_id", sa.String(ID), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("to_class_group_id", sa.String(ID), nullable=True),
        sa.Column("reason_key", sa.String(200), nullable=True),
        sa.Column("overridden_by_staff_profile_id", sa.String(ID), nullable=True),
        sa.Column("previous_enrolment_id", sa.String(ID), nullable=True),
        sa.Column("new_enrolment_id", sa.String(ID), nullable=True),
        sa.Column("previous_learner_status", sa.String(16), nullable=True),
        sa.Column("previous_left_on", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["run_id", "tenant_id"], ["rollover_runs.id", "rollover_runs.tenant_id"]),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(["to_class_group_id", "tenant_id"], ["class_groups.id", "class_groups.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["overridden_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.UniqueConstraint("tenant_id", "run_id", "learner_id", name="uq_promotion_decisions_learner"),
        sa.CheckConstraint(f"action IN {ACTIONS}", name="action_valid"),
        sa.CheckConstraint(
            "(to_class_group_id IS NOT NULL) = (action IN ('promote','detain'))", name="target_iff_promote_or_detain"
        ),
        sa.CheckConstraint(REASON, name="reason_key_valid"),
    )
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
        op.execute(f"REVOKE ALL ON {table} FROM nexus_app")
        op.execute(f"GRANT SELECT, INSERT ON {table} TO nexus_app")
    op.execute(f"GRANT UPDATE (status, {', '.join(COUNTS)}, rollback_until, updated_at) ON rollover_runs TO nexus_app")
    op.execute(
        "GRANT UPDATE (action, to_class_group_id, reason_key, overridden_by_staff_profile_id, previous_enrolment_id, "
        "new_enrolment_id, previous_learner_status, previous_left_on) ON promotion_decisions TO nexus_app"
    )
    # Applying and reversing a run (D84): the app role may open and remove enrolments and close or reopen them,
    # and change a learner's status and leaving date. Nothing else on these tables.
    op.execute("GRANT INSERT, DELETE, UPDATE (status, effective_to, updated_at) ON enrolments TO nexus_app")
    op.execute("GRANT UPDATE (status, left_on, updated_at) ON learners TO nexus_app")


def downgrade() -> None:
    op.execute("REVOKE UPDATE (status, left_on, updated_at) ON learners FROM nexus_app")
    op.execute("REVOKE INSERT, DELETE, UPDATE (status, effective_to, updated_at) ON enrolments FROM nexus_app")
    for table in reversed(TABLES):
        op.drop_table(table)
