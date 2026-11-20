"""Demo RBAC and entitlements (NEX-046): roles with their permissions, role assignments, module switches."""

from typing import Any

from sqlalchemy import Connection, text

#: Children first, for `--reset`.
RBAC_TABLES_CHILD_FIRST = ("role_assignments", "role_permissions", "roles", "entitlements")


def _rows(data: dict[str, Any], key: str, tenant_id: str) -> list[dict[str, Any]]:
    return [r for r in data[key] if r["tenantId"] == tenant_id]


def seed_rbac(conn: Connection, data: dict[str, Any], tid: str) -> None:
    """Upserts roles, role permissions (replaced as a set), assignments and entitlements of one tenant."""
    for role in _rows(data, "roles", tid):
        conn.execute(
            text(
                "INSERT INTO roles (id, tenant_id, name, system, allowed_scope_kinds, created_at, "
                "updated_at) "
                "VALUES (:id, :t, :name, :system, :kinds, :created, :updated) ON CONFLICT (id) DO UPDATE SET "
                "name = EXCLUDED.name, system = EXCLUDED.system, "
                "allowed_scope_kinds = EXCLUDED.allowed_scope_kinds, updated_at = EXCLUDED.updated_at"
            ),
            {
                "id": role["id"],
                "t": tid,
                "name": role["name"],
                "system": role["system"],
                "kinds": role["allowedScopeKinds"],
                "created": role["createdAt"],
                "updated": role["updatedAt"],
            },
        )
        conn.execute(text("DELETE FROM role_permissions WHERE role_id = :r"), {"r": role["id"]})
        for code in role["permissions"]:
            conn.execute(
                text("INSERT INTO role_permissions (role_id, permission_code, tenant_id) VALUES (:r, :c, :t)"),
                {"r": role["id"], "c": code, "t": tid},
            )
    for a in _rows(data, "roleAssignments", tid):
        conn.execute(
            text(
                "INSERT INTO role_assignments (id, tenant_id, user_id, role_id, scope_kind, scope_target_id, "
                "academic_year_id, effective_from, effective_to, granted_by, created_at) "
                "VALUES (:id, :t, :u, :role, :kind, :target, :year, :from_, :to, :by, :created) "
                "ON CONFLICT (id) DO UPDATE SET "
                "scope_kind = EXCLUDED.scope_kind, scope_target_id = EXCLUDED.scope_target_id, "
                "effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to"
            ),
            {
                "id": a["id"],
                "t": tid,
                "u": a["userId"],
                "role": a["roleId"],
                "kind": a["scope"]["kind"],
                "target": a["scope"]["targetId"],
                "year": a["academicYearId"],
                "from_": a["effectiveFrom"],
                "to": a["effectiveTo"],
                "by": a["grantedBy"],
                "created": a["createdAt"],
            },
        )
    for e in _rows(data, "entitlements", tid):
        conn.execute(
            text(
                "INSERT INTO entitlements (tenant_id, module_id, enabled, source, expires_at) VALUES "
                "(:t, :m, :on, :src, :exp) ON CONFLICT (tenant_id, module_id) DO UPDATE SET "
                "enabled = EXCLUDED.enabled, source = EXCLUDED.source, expires_at = EXCLUDED.expires_at"
            ),
            {"t": tid, "m": e["moduleId"], "on": e["enabled"], "src": e["source"], "exp": e["expiresAt"]},
        )
