"""Accounting (M19, NEX-206): ledger accounts, journal entries and budgets.

Journal entries are immutable for the app role (insert only) and always balanced: `m19_journal_lines_valid` checks
2-100 lines, each with exactly one positive side, and equal debit and credit totals.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0034_accounting"
down_revision: str | None = "0033_fees"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("ledger_accounts", "journal_entries", "budgets")
CURRENCY = "currency ~ '^[A-Z]{3}$'"


def _ids() -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("institution_id", sa.String(ID), nullable=False),
    ]


def _institution() -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"])


def _stamp(name: str) -> sa.Column[object]:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION m19_journal_lines_valid(lines jsonb) RETURNS boolean
        LANGUAGE plpgsql IMMUTABLE STRICT AS $$
        DECLARE
          line jsonb;
          debit numeric;
          credit numeric;
          debits numeric := 0;
          credits numeric := 0;
        BEGIN
          IF jsonb_typeof(lines) <> 'array' OR jsonb_array_length(lines) NOT BETWEEN 2 AND 100 THEN
            RETURN false;
          END IF;
          FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
            IF jsonb_typeof(line) <> 'object' THEN RETURN false; END IF;
            IF coalesce(jsonb_typeof(line -> 'debit'), '') <> 'number'
               OR coalesce(jsonb_typeof(line -> 'credit'), '') <> 'number' THEN
              RETURN false;
            END IF;
            debit := (line ->> 'debit')::numeric;
            credit := (line ->> 'credit')::numeric;
            IF debit < 0 OR credit < 0 OR (debit > 0) = (credit > 0) THEN RETURN false; END IF;
            debits := debits + debit;
            credits := credits + credit;
          END LOOP;
          RETURN debits = credits;
        END;
        $$
        """
    )
    op.create_table(
        "ledger_accounts",
        *_ids(),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("parent_id", sa.String(ID), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        _institution(),
        sa.ForeignKeyConstraint(["parent_id", "tenant_id"], ["ledger_accounts.id", "ledger_accounts.tenant_id"]),
        sa.UniqueConstraint("id", "tenant_id", name="uq_ledger_accounts_ref_tenant"),
        sa.UniqueConstraint("institution_id", "code", name="uq_ledger_accounts_code"),
        sa.CheckConstraint("code ~ '^[0-9]{3,10}$'", name="code_valid"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint("kind IN ('asset','liability','equity','income','expense')", name="kind_valid"),
        sa.CheckConstraint("parent_id <> id", name="parent_not_self"),
    )
    op.create_table(
        "journal_entries",
        *_ids(),
        sa.Column("posted_on", sa.Date(), nullable=False),
        sa.Column("reference", sa.String(60), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("lines", JSONB(), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        _stamp("created_at"),
        _institution(),
        sa.CheckConstraint("length(btrim(reference)) > 0", name="reference_present"),
        sa.CheckConstraint(CURRENCY, name="currency_valid"),
        sa.CheckConstraint("m19_journal_lines_valid(lines)", name="lines_balanced"),
        sa.CheckConstraint("source IN ('manual','fees','payroll','import')", name="source_valid"),
    )
    op.create_table(
        "budgets",
        *_ids(),
        sa.Column("academic_year_id", sa.String(ID), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("lines", JSONB(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        _stamp("created_at"),
        _stamp("updated_at"),
        _institution(),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        sa.CheckConstraint(CURRENCY, name="currency_valid"),
        sa.CheckConstraint(
            "jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 200", name="lines_valid"
        ),
        sa.CheckConstraint("status IN ('draft','approved','closed')", name="status_valid"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
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
    op.execute("GRANT INSERT ON journal_entries TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.execute("DROP FUNCTION m19_journal_lines_valid(jsonb)")
