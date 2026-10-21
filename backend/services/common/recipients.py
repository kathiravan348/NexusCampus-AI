"""
Recipient resolvers for the notification engine (Build Spec §3.2: every alert says WHO).
"""
from typing import Iterable


def _ids(rows) -> list[str]:
    return [str(r[0]) for r in rows]


async def with_permission(conn, *perms: str) -> list[str]:
    """Active users whose role grants any permission. Platform super admins only for platform permissions."""
    rows = await conn.fetch(
        """SELECT u.id FROM users u JOIN roles r ON r.key = u.role_key
           WHERE u.status = 'active' AND u.deleted_at IS NULL
             AND (r.permissions ?| $1::text[]
                  OR (r.permissions ? '*' AND 'platform.tenants.manage' = ANY($1::text[])))""", list(perms))
    return _ids(rows)


async def student_user(conn, student_id) -> list[str]:
    return _ids(await conn.fetch(
        "SELECT id FROM users WHERE student_id = $1 AND status = 'active' AND deleted_at IS NULL", student_id))


async def guardians_of(conn, student_id) -> list[str]:
    return _ids(await conn.fetch(
        """SELECT u.id FROM guardian_student_links l JOIN users u ON u.guardian_id = l.guardian_id
           WHERE l.student_id = $1 AND l.status = 'active' AND l.deleted_at IS NULL
             AND u.status = 'active' AND u.deleted_at IS NULL""", student_id))


async def student_and_guardians(conn, student_id) -> list[str]:
    return await student_user(conn, student_id) + await guardians_of(conn, student_id)


async def teachers_of(conn, student_id) -> list[str]:
    return _ids(await conn.fetch(
        """SELECT DISTINCT u.id FROM enrollments e
           JOIN course_sections cs ON cs.id = e.section_id
           JOIN users u ON u.staff_id = cs.teacher_staff_id
           WHERE e.student_id = $1 AND e.status = 'active' AND e.deleted_at IS NULL
             AND u.status = 'active'""", student_id))


async def staff_user(conn, staff_id) -> list[str]:
    if not staff_id:
        return []
    return _ids(await conn.fetch(
        "SELECT id FROM users WHERE staff_id = $1 AND status = 'active' AND deleted_at IS NULL", staff_id))


async def section_teacher(conn, section_id) -> list[str]:
    return _ids(await conn.fetch(
        """SELECT u.id FROM course_sections cs JOIN users u ON u.staff_id = cs.teacher_staff_id
           WHERE cs.id = $1 AND u.status = 'active'""", section_id))


async def section_families(conn, section_id, include_guardians: bool = True) -> list[str]:
    students = _ids(await conn.fetch(
        """SELECT u.id FROM enrollments e JOIN users u ON u.student_id = e.student_id
           WHERE e.section_id = $1 AND e.status = 'active' AND e.deleted_at IS NULL AND u.status = 'active'""",
        section_id))
    if not include_guardians:
        return students
    guardians = _ids(await conn.fetch(
        """SELECT DISTINCT u.id FROM enrollments e
           JOIN guardian_student_links l ON l.student_id = e.student_id AND l.status = 'active'
           JOIN users u ON u.guardian_id = l.guardian_id
           WHERE e.section_id = $1 AND e.status = 'active' AND e.deleted_at IS NULL AND u.status = 'active'""",
        section_id))
    return students + guardians


async def all_active_users(conn, roles: Iterable[str] | None = None) -> list[str]:
    if roles:
        return _ids(await conn.fetch(
            "SELECT id FROM users WHERE status = 'active' AND deleted_at IS NULL AND role_key = ANY($1::text[])",
            list(roles)))
    return _ids(await conn.fetch("SELECT id FROM users WHERE status = 'active' AND deleted_at IS NULL"))
