import hashlib
import json
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DB_HOST = "localhost"
DB_PORT = 5432
DB_USER = "postgres"
DB_PASSWORD = "postgrespassword"

def hash_password(password: str) -> str:
    # SHA-256 hash with standard salt
    salt = "nexus_campus_salt_2026"
    return hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()

DEMO_USERS = [
    {
        "id": "USR-ADM-01",
        "name": "System Administrator",
        "email": "admin@nexuscampus.edu",
        "password": hash_password("demo123"),
        "role": "admin",
        "department": "Executive Leadership",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=AdminSys",
        "permissions": ["*"]
    },
    {
        "id": "USR-STU-01",
        "name": "Emma Watson",
        "email": "student@nexuscampus.edu",
        "password": hash_password("demo123"),
        "role": "student",
        "department": "Computer Science & AI",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=EmmaWatson",
        "permissions": ["lms", "player", "attendance_view", "timetable_view", "library", "wellbeing", "placement_view", "profile"]
    },
    {
        "id": "USR-TCH-01",
        "name": "Dr. Alan Turing",
        "email": "teacher@nexuscampus.edu",
        "password": hash_password("demo123"),
        "role": "teacher",
        "department": "Computer Science & AI",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=AlanTuring",
        "permissions": ["academics", "gradebook", "attendance_mark", "lms_builder", "quiz_engine", "studio", "timetable_view", "student_view"]
    },
    {
        "id": "USR-HR-01",
        "name": "Sarah Jenkins",
        "email": "hr@nexuscampus.edu",
        "password": hash_password("demo123"),
        "role": "hr",
        "department": "Human Resources & Payroll",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=SarahJenkins",
        "permissions": ["hr", "staff_manage", "payroll", "setup", "accreditation", "security"]
    },
    {
        "id": "USR-PLC-01",
        "name": "Marcus Vance",
        "email": "placement@nexuscampus.edu",
        "password": hash_password("demo123"),
        "role": "placement",
        "department": "Career & Corporate Relations",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=MarcusVance",
        "permissions": ["placement", "placement_hub", "student_view", "company_drives", "career_analytics"]
    },
    {
        "id": "USR-EXM-01",
        "name": "Prof. Donald Knuth",
        "email": "examiner@nexuscampus.edu",
        "password": hash_password("demo123"),
        "role": "examiner",
        "department": "Academic Examination Board",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=DonaldKnuth",
        "permissions": ["examinations", "gradebook_verify", "accreditation", "timetable_view", "student_view", "exam_normalization"]
    },
    {
        "id": "USR-PAR-01",
        "name": "Arthur Watson",
        "email": "parent@nexuscampus.edu",
        "password": hash_password("demo123"),
        "role": "parent",
        "department": "Guardian Portal",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=ArthurWatson",
        "permissions": ["parent_portal", "wellbeing_view", "fees_view", "broadcast_view"]
    }
]

def setup_users_in_database(db_name: str):
    print(f"[*] Initializing 'users' table and personas in {db_name}...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=db_name
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                department VARCHAR(100),
                avatar VARCHAR(500),
                permissions JSONB DEFAULT '[]',
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """)

        for u in DEMO_USERS:
            cur.execute("""
                INSERT INTO users (id, name, email, password_hash, role, department, avatar, permissions, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, 'active')
                ON CONFLICT (email) DO UPDATE
                SET name = EXCLUDED.name,
                    password_hash = EXCLUDED.password_hash,
                    role = EXCLUDED.role,
                    department = EXCLUDED.department,
                    avatar = EXCLUDED.avatar,
                    permissions = EXCLUDED.permissions;
            """, (
                u["id"], u["name"], u["email"], u["password"],
                u["role"], u["department"], u["avatar"], json.dumps(u["permissions"])
            ))

        cur.execute("SELECT COUNT(*) FROM users;")
        count = cur.fetchone()[0]
        print(f"    [OK] {db_name}: {count} users ready.")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    target_dbs = ["nexus_default_demo", "nexus_tenant_greenwood", "nexus_tenant_oxfordbay"]
    for db in target_dbs:
        try:
            setup_users_in_database(db)
        except Exception as e:
            print(f"    [WARN] Failed to setup {db}: {e}")
    print("\n[OK] User schema and personas initialized successfully across all databases.")
