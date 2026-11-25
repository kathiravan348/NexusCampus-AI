"""Fees and payments (M18, NEX-188): heads, plans, concessions, invoices, payments, refunds.

Money is `bigint` minor units in one ISO currency per row. Concession and refund reasons are personal data:
FieldCipher text under the tenant's `tenant_data` key. The app role may insert payments and update only the paid
amount, status and update time of invoices (applying a payment); everything else is read-only.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "0033_fees"
down_revision: str | None = "0032_attendance"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("fee_heads", "fee_plans", "concessions", "fee_invoices", "fee_payments", "fee_refunds")
CIPHER = "'^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'"
CURRENCY = "currency ~ '^[A-Z]{3}$'"


def _ids(*extra: sa.Column[object]) -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        *extra,
    ]


def _created() -> sa.Column[object]:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def _updated() -> sa.Column[object]:
    return sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def _ref(name: str) -> sa.UniqueConstraint:
    return sa.UniqueConstraint("id", "tenant_id", name=f"uq_{name}_ref_tenant")


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION m18_ids_valid(ids varchar[], max_count int) RETURNS boolean
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
          SELECT cardinality(ids) BETWEEN 1 AND max_count AND coalesce(array_ndims(ids), 1) = 1
            AND cardinality(ids) = (SELECT count(DISTINCT id) FROM unnest(ids) AS item(id) WHERE length(id) > 0)
        $$
        """
    )
    op.create_table(
        "fee_heads",
        *_ids(
            sa.Column("institution_id", sa.String(ID), nullable=False),
            sa.Column("code", sa.String(32), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("tax_rate_basis_points", sa.Integer(), nullable=False),
            sa.Column("refundable", sa.Boolean(), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False),
        ),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        _ref("fee_heads"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint("tax_rate_basis_points BETWEEN 0 AND 10000", name="tax_rate_valid"),
    )
    op.create_table(
        "fee_plans",
        *_ids(
            sa.Column("institution_id", sa.String(ID), nullable=False),
            sa.Column("academic_year_id", sa.String(ID), nullable=False),
            sa.Column("program_id", sa.String(ID), nullable=True),
            sa.Column("year_level_id", sa.String(ID), nullable=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("currency", sa.String(3), nullable=False),
            sa.Column("lines", JSONB(), nullable=False),
            sa.Column("instalments", JSONB(), nullable=False),
            _created(),
            _updated(),
        ),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        sa.ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["year_level_id", "tenant_id", "program_id"],
            ["year_levels.id", "year_levels.tenant_id", "year_levels.program_id"],
        ),
        _ref("fee_plans"),
        sa.CheckConstraint("year_level_id IS NULL OR program_id IS NOT NULL", name="year_level_has_program"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint(CURRENCY, name="currency_valid"),
        sa.CheckConstraint(
            "jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 30", name="lines_valid"
        ),
        sa.CheckConstraint(
            "jsonb_typeof(instalments) = 'array' AND jsonb_array_length(instalments) BETWEEN 1 AND 24",
            name="instalments_valid",
        ),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "concessions",
        *_ids(
            sa.Column("learner_id", sa.String(ID), nullable=False),
            sa.Column("fee_plan_id", sa.String(ID), nullable=False),
            sa.Column("kind", sa.String(16), nullable=False),
            sa.Column("mode", sa.String(8), nullable=False),
            sa.Column("value", sa.BigInteger(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("approved_by_staff_profile_id", sa.String(ID), nullable=True),
            sa.Column("valid_from", sa.Date(), nullable=False),
            sa.Column("valid_to", sa.Date(), nullable=True),
            _created(),
        ),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(["fee_plan_id", "tenant_id"], ["fee_plans.id", "fee_plans.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["approved_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.CheckConstraint(
            "kind IN ('sibling','merit','need_based','staff_child','scholarship','award_credit','other')",
            name="kind_valid",
        ),
        sa.CheckConstraint("mode IN ('percent','fixed')", name="mode_valid"),
        sa.CheckConstraint("value >= 1 AND (mode <> 'percent' OR value <= 10000)", name="value_valid"),
        sa.CheckConstraint(f"reason ~ {CIPHER}", name="reason_encrypted"),
        sa.CheckConstraint("valid_to >= valid_from", name="valid_dates"),
    )
    op.create_table(
        "fee_invoices",
        *_ids(
            sa.Column("learner_id", sa.String(ID), nullable=False),
            sa.Column("invoice_number", sa.String(40), nullable=False),
            sa.Column("currency", sa.String(3), nullable=False),
            sa.Column("issued_on", sa.Date(), nullable=False),
            sa.Column("due_on", sa.Date(), nullable=False),
            sa.Column("lines", JSONB(), nullable=False),
            sa.Column("total", sa.BigInteger(), nullable=False),
            sa.Column("paid", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            _created(),
            _updated(),
        ),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        _ref("fee_invoices"),
        sa.UniqueConstraint("tenant_id", "invoice_number", name="uq_fee_invoices_number"),
        sa.CheckConstraint("length(btrim(invoice_number)) > 0", name="number_present"),
        sa.CheckConstraint(CURRENCY, name="currency_valid"),
        sa.CheckConstraint("due_on >= issued_on", name="due_after_issue"),
        sa.CheckConstraint(
            "jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 50", name="lines_valid"
        ),
        sa.CheckConstraint("total >= 0 AND paid >= 0 AND paid <= total", name="amounts_valid"),
        sa.CheckConstraint("status IN ('draft','issued','part_paid','paid','void','written_off')", name="status_valid"),
        sa.CheckConstraint(
            "(status <> 'issued' OR paid = 0) AND (status <> 'part_paid' OR (paid > 0 AND paid < total)) "
            "AND (status <> 'paid' OR paid = total)",
            name="status_matches_paid",
        ),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "fee_payments",
        *_ids(
            sa.Column("invoice_ids", ARRAY(sa.String(ID)), nullable=False),
            sa.Column("payer_person_id", sa.String(ID), nullable=False),
            sa.Column("currency", sa.String(3), nullable=False),
            sa.Column("amount", sa.BigInteger(), nullable=False),
            sa.Column("method", sa.String(16), nullable=False),
            sa.Column("gateway_reference", sa.String(120), nullable=True),
            sa.Column("receipt_number", sa.String(40), nullable=False),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("device_id", sa.String(ID), nullable=True),
        ),
        sa.ForeignKeyConstraint(["payer_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        _ref("fee_payments"),
        sa.UniqueConstraint("tenant_id", "receipt_number", name="uq_fee_payments_receipt"),
        sa.CheckConstraint("m18_ids_valid(invoice_ids, 20)", name="invoice_ids_valid"),
        sa.CheckConstraint(CURRENCY, name="currency_valid"),
        sa.CheckConstraint("amount >= 1", name="amount_positive"),
        sa.CheckConstraint(
            "method IN ('cash','cheque','bank_transfer','card','upi','wallet','gateway')", name="method_valid"
        ),
        sa.CheckConstraint("length(btrim(gateway_reference)) > 0", name="reference_present"),
        sa.CheckConstraint("length(btrim(receipt_number)) > 0", name="receipt_present"),
        sa.CheckConstraint("status IN ('pending','succeeded','failed','reversed')", name="status_valid"),
    )
    op.create_table(
        "fee_refunds",
        *_ids(
            sa.Column("payment_id", sa.String(ID), nullable=False),
            sa.Column("amount", sa.BigInteger(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("decided_by_staff_profile_id", sa.String(ID), nullable=True),
            sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
            _created(),
        ),
        sa.ForeignKeyConstraint(["payment_id", "tenant_id"], ["fee_payments.id", "fee_payments.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["decided_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.CheckConstraint("amount >= 1", name="amount_positive"),
        sa.CheckConstraint(f"reason ~ {CIPHER}", name="reason_encrypted"),
        sa.CheckConstraint("status IN ('requested','approved','paid','rejected')", name="status_valid"),
        sa.CheckConstraint(
            "(decided_by_staff_profile_id IS NOT NULL) = (status <> 'requested') "
            "AND (decided_at IS NOT NULL) = (status <> 'requested')",
            name="decided_iff_not_requested",
        ),
        sa.CheckConstraint("decided_at >= created_at", name="decided_after_created"),
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
        op.execute(f"GRANT SELECT ON {table} TO nexus_app")
    op.execute("GRANT INSERT ON fee_payments TO nexus_app")
    op.execute("GRANT UPDATE (paid, status, updated_at) ON fee_invoices TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.execute("DROP FUNCTION m18_ids_valid(varchar[], int)")
