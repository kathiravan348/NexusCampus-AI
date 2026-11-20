"""RBAC and module switches (NEX-046): permission catalogue (global), roles, role permissions, role
assignments, entitlements — tenant tables with forced Row-Level Security.

Revision ID: 0004_rbac_entitlements
Revises: 0003_identity
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_rbac_entitlements"
down_revision: str | None = "0003_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "nexus_app"
ID = 128
SCOPE_KINDS = "('group', 'institution', 'campus', 'department', 'class', 'own')"
SCOPE_KINDS_ARRAY = "ARRAY['group', 'institution', 'campus', 'department', 'class', 'own']::varchar[]"

#: Catalogue snapshot at this revision (later revisions add rows); equals `nexus.core.permissions.CATALOGUE`.
CATALOGUE = [
    ("m01.institution.read", False, "m01.permission.institutionRead"),
    ("m01.institution.manage", False, "m01.permission.institutionManage"),
    ("m01.calendar.manage", False, "m01.permission.calendarManage"),
    ("m02.user.read", False, "m02.permission.userRead"),
    ("m02.user.invite", False, "m02.permission.userInvite"),
    ("m02.role.manage", False, "m02.permission.roleManage"),
    ("m02.person.read_restricted", True, "m02.permission.personReadRestricted"),
    ("m02.sso.manage", False, "m02.permission.ssoManage"),
    ("m03.theme.manage", False, "m03.permission.themeManage"),
    ("m04.text.manage", False, "m04.permission.textManage"),
    ("m05.plan.read", False, "m05.permission.planRead"),
    ("m05.module.manage", False, "m05.permission.moduleManage"),
    ("m06.audit.read", False, "m06.permission.auditRead"),
    ("m06.consent.manage", False, "m06.permission.consentManage"),
    ("m06.request.manage", True, "m06.permission.requestManage"),
    ("m07.template.manage", False, "m07.permission.templateManage"),
    ("m07.notification.send", False, "m07.permission.notificationSend"),
    ("m07.preference.manage", False, "m07.permission.preferenceManage"),
    ("m10.device.read", False, "m10.permission.deviceRead"),
    ("m10.device.wipe", False, "m10.permission.deviceWipe"),
    ("m11.assist.use", False, "m11.permission.assistUse"),
    ("m11.settings.manage", False, "m11.permission.settingsManage"),
    ("m83.vault.read", False, "m83.permission.vaultRead"),
    ("m83.grant.approve", True, "m83.permission.grantApprove"),
]


def _tenant() -> sa.Column[str]:
    return sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True)


def upgrade() -> None:
    permissions = op.create_table(
        "permissions",
        sa.Column("code", sa.String(80), primary_key=True),
        sa.Column("module_id", sa.String(3), nullable=False),
        sa.Column("sensitive", sa.Boolean(), nullable=False),
        sa.Column("description_key", sa.String(120), nullable=False),
        sa.CheckConstraint(
            "code ~ '^[mp](0[1-9]|[1-9][0-9])\\.[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$'", name="code_format"
        ),
        sa.CheckConstraint("code LIKE lower(module_id) || '.%'", name="code_in_module"),
    )
    op.bulk_insert(
        permissions,
        [
            {"code": c, "module_id": c[:3].upper(), "sensitive": s, "description_key": k}
            for c, s, k in CATALOGUE
        ],
    )
    op.create_table(
        "roles",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("system", sa.Boolean(), nullable=False),
        sa.Column("allowed_scope_kinds", sa.ARRAY(sa.String(32)), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("id", "tenant_id"),
        sa.CheckConstraint("cardinality(allowed_scope_kinds) >= 1", name="has_scope_kinds"),
        sa.CheckConstraint(f"allowed_scope_kinds <@ {SCOPE_KINDS_ARRAY}", name="scope_kinds_known"),
    )
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.String(ID), primary_key=True),
        sa.Column("permission_code", sa.String(80), sa.ForeignKey("permissions.code"), primary_key=True),
        _tenant(),
        sa.ForeignKeyConstraint(["role_id", "tenant_id"], ["roles.id", "roles.tenant_id"]),
    )
    op.create_table(
        "role_assignments",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("user_id", sa.String(ID), nullable=False, index=True),
        sa.Column("role_id", sa.String(ID), nullable=False),
        sa.Column("scope_kind", sa.String(32), nullable=False),
        sa.Column("scope_target_id", sa.String(ID), nullable=True),
        sa.Column("academic_year_id", sa.String(ID), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("granted_by", sa.String(ID), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id", "tenant_id"], ["users.id", "users.tenant_id"]),
        sa.ForeignKeyConstraint(["role_id", "tenant_id"], ["roles.id", "roles.tenant_id"]),
        sa.CheckConstraint(f"scope_kind IN {SCOPE_KINDS}", name="scope_kind_known"),
        sa.CheckConstraint("(scope_target_id IS NULL) = (scope_kind = 'own')", name="target_iff_not_own"),
        sa.CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="effective_range"),
    )
    op.create_table(
        "entitlements",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("module_id", sa.String(3), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("source IN ('core', 'plan', 'addon', 'trial')", name="source_known"),
        sa.CheckConstraint("source <> 'core' OR enabled", name="core_always_on"),
        sa.CheckConstraint("source <> 'trial' OR expires_at IS NOT NULL", name="trial_expires"),
    )

    for table in ("roles", "role_permissions", "role_assignments", "entitlements"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
    op.execute(f"GRANT SELECT ON permissions TO {APP_ROLE}")
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON roles, role_permissions, role_assignments TO {APP_ROLE}"
    )
    # Entitlements are switched (UPDATE) by tenant admins (NEX-055); rows come from Nexus Control (Stage 2).
    op.execute(f"GRANT SELECT, UPDATE ON entitlements TO {APP_ROLE}")
    # System roles (shipped with the product) are read-only for everyone using the app role.
    op.execute(
        """
        CREATE FUNCTION roles_system_read_only() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
          is_system boolean := false;
          rid varchar;
        BEGIN
          IF current_user = 'nexus_app' THEN
            IF TG_TABLE_NAME = 'roles' THEN
              IF TG_OP = 'INSERT' THEN
                is_system := NEW.system;
              ELSIF TG_OP = 'UPDATE' THEN
                is_system := OLD.system OR NEW.system;
              ELSE
                is_system := OLD.system;
              END IF;
            ELSE
              IF TG_OP = 'DELETE' THEN rid := OLD.role_id; ELSE rid := NEW.role_id; END IF;
              SELECT r.system INTO is_system FROM roles r WHERE r.id = rid;
            END IF;
            IF is_system THEN
              RAISE EXCEPTION 'system roles are read-only' USING ERRCODE = 'insufficient_privilege';
            END IF;
          END IF;
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END $$;
        """
    )
    for table in ("roles", "role_permissions"):
        op.execute(
            f"CREATE TRIGGER {table}_system_read_only BEFORE INSERT OR UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION roles_system_read_only()"
        )


def downgrade() -> None:
    for table in ("entitlements", "role_assignments", "role_permissions", "roles", "permissions"):
        op.drop_table(table)
    op.execute("DROP FUNCTION IF EXISTS roles_system_read_only()")
