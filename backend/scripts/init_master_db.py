import os
import sys
import json
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Add root backend to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.common.config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, MASTER_DB, DEFAULT_DEMO_DB

def run_init():
    print(f"[*] Connecting to PostgreSQL at {DB_HOST}:{DB_PORT} as {DB_USER}...")
    
    # 1. Connect to default postgres DB to ensure MASTER_DB and DEFAULT_DEMO_DB exist
    root_conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname="postgres"
    )
    root_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    root_cur = root_conn.cursor()

    # Create MASTER_DB if not exists
    root_cur.execute(f"SELECT 1 FROM pg_database WHERE datname = '{MASTER_DB}';")
    if not root_cur.fetchone():
        print(f"[+] Creating master registry database: {MASTER_DB}...")
        root_cur.execute(f'CREATE DATABASE "{MASTER_DB}";')
    else:
        print(f"[OK] Master database {MASTER_DB} already exists.")

    # Create DEFAULT_DEMO_DB if not exists
    root_cur.execute(f"SELECT 1 FROM pg_database WHERE datname = '{DEFAULT_DEMO_DB}';")
    demo_db_exists = bool(root_cur.fetchone())
    if not demo_db_exists:
        print(f"[+] Creating master demo template database: {DEFAULT_DEMO_DB}...")
        root_cur.execute(f'CREATE DATABASE "{DEFAULT_DEMO_DB}";')
    else:
        print(f"[OK] Default demo database {DEFAULT_DEMO_DB} already exists.")

    root_cur.close()
    root_conn.close()

    # 2. Setup MASTER_DB tables
    print(f"[*] Initializing tables in {MASTER_DB}...")
    master_conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=MASTER_DB
    )
    master_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    m_cur = master_conn.cursor()
    m_cur.execute("""
        CREATE TABLE IF NOT EXISTS tenants (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) UNIQUE NOT NULL,
            db_name VARCHAR(150) UNIQUE NOT NULL,
            admin_email VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'active',
            plan VARCHAR(50) DEFAULT 'enterprise_demo',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        INSERT INTO tenants (name, slug, db_name, admin_email, status, plan)
        VALUES ('NexusCampus Master Demo Template', 'default', 'nexus_default_demo', 'demo@nexuscampus.ai', 'active', 'master_template')
        ON CONFLICT (slug) DO NOTHING;
    """)
    m_cur.close()
    master_conn.close()

    # 3. Setup DEFAULT_DEMO_DB Schema & Seeds
    print(f"[*] Initializing full schema & seeds in {DEFAULT_DEMO_DB}...")
    demo_conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DEFAULT_DEMO_DB
    )
    demo_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    d_cur = demo_conn.cursor()

    d_cur.execute("""
        CREATE TABLE IF NOT EXISTS institution_settings (
            id SERIAL PRIMARY KEY,
            institution_name VARCHAR(255) NOT NULL,
            admin_email VARCHAR(255) NOT NULL,
            campus_name VARCHAR(255) DEFAULT 'Main Campus',
            country VARCHAR(100) DEFAULT 'United States',
            currency VARCHAR(10) DEFAULT 'USD',
            academic_year VARCHAR(50) DEFAULT '2026-2027',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        INSERT INTO institution_settings (id, institution_name, admin_email, campus_name)
        VALUES (1, 'NexusCampus AI Institute of Technology', 'admin@nexuscampus.edu', 'North Campus')
        ON CONFLICT (id) DO NOTHING;

        CREATE TABLE IF NOT EXISTS students (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            avatar VARCHAR(500),
            program VARCHAR(255),
            cohort VARCHAR(50),
            semester VARCHAR(50),
            gpa NUMERIC(3,2),
            attendance_rate NUMERIC(4,1),
            fee_status VARCHAR(50),
            outstanding_amount NUMERIC(10,2) DEFAULT 0,
            admissions_stage VARCHAR(50),
            advisor VARCHAR(255),
            guardian_name VARCHAR(255),
            guardian_phone VARCHAR(50),
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS staff (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            role VARCHAR(255) NOT NULL,
            department VARCHAR(255) NOT NULL,
            avatar VARCHAR(500),
            joining_date VARCHAR(50),
            status VARCHAR(50) DEFAULT 'active',
            salary_band VARCHAR(100),
            courses_count INT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS courses (
            id VARCHAR(50) PRIMARY KEY,
            code VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            category VARCHAR(100),
            instructor_id VARCHAR(50),
            instructor_name VARCHAR(255),
            enrolled_students INT DEFAULT 0,
            rating NUMERIC(2,1) DEFAULT 4.8,
            modules_count INT DEFAULT 8,
            status VARCHAR(50) DEFAULT 'published',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id VARCHAR(50) PRIMARY KEY,
            student_id VARCHAR(50),
            student_name VARCHAR(255) NOT NULL,
            fee_type VARCHAR(100) NOT NULL,
            amount NUMERIC(10,2) NOT NULL,
            paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
            due_date VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'Pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS admissions_leads (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            course VARCHAR(255),
            stage VARCHAR(50) DEFAULT 'new',
            lead_score INT DEFAULT 85,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS timetable_slots (
            id VARCHAR(50) PRIMARY KEY,
            day_name VARCHAR(50),
            time_slot VARCHAR(50),
            course_code VARCHAR(50),
            subject_name VARCHAR(255),
            room VARCHAR(100),
            instructor VARCHAR(255),
            session_type VARCHAR(50),
            duration_hours NUMERIC(3,1)
        );

        CREATE TABLE IF NOT EXISTS module_records (
            id VARCHAR(50) PRIMARY KEY,
            module_id VARCHAR(20) NOT NULL,
            name VARCHAR(255) NOT NULL,
            reference_code VARCHAR(100),
            scope TEXT,
            status VARCHAR(50) DEFAULT 'active',
            tags JSONB DEFAULT '[]',
            notes TEXT,
            student_id VARCHAR(50),
            cohort VARCHAR(50),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS module_workflows (
            id VARCHAR(50) PRIMARY KEY,
            module_id VARCHAR(20) NOT NULL,
            title VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'completed',
            actor VARCHAR(255),
            timestamp VARCHAR(100)
        );
    """)

    # Seed Students
    d_cur.execute("""
        INSERT INTO students (id, name, email, phone, avatar, program, cohort, semester, gpa, attendance_rate, fee_status, outstanding_amount, admissions_stage, advisor, guardian_name, guardian_phone, status)
        VALUES 
        ('STU-1001', 'Emma Watson', 'emma.w@nexuscampus.edu', '+1 (555) 234-5678', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 'B.Sc. Computer Science & AI', '2024-2028', 'Semester 3', 3.92, 96.5, 'paid', 0, 'enrolled', 'Dr. Alan Turing', 'Chris Watson', '+1 (555) 234-9999', 'active'),
        ('STU-1002', 'Liam Smith', 'liam.s@nexuscampus.edu', '+1 (555) 345-6789', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'B.BA. Digital Business', '2024-2028', 'Semester 3', 3.45, 88.0, 'partial', 1250, 'enrolled', 'Prof. Margaret Hamilton', 'Sarah Smith', '+1 (555) 345-8888', 'active'),
        ('STU-1003', 'Noah Johnson', 'noah.j@nexuscampus.edu', '+1 (555) 456-7890', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', 'B.Eng. Robotics & Autonomous Systems', '2023-2027', 'Semester 5', 3.78, 94.2, 'paid', 0, 'enrolled', 'Dr. Alan Turing', 'Michael Johnson', '+1 (555) 456-1111', 'active'),
        ('STU-1004', 'Olivia Williams', 'olivia.w@nexuscampus.edu', '+1 (555) 567-8901', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150', 'B.Sc. Cognitive Psychology', '2024-2028', 'Semester 3', 3.85, 92.1, 'overdue', 3400, 'enrolled', 'Dr. Katherine Johnson', 'David Williams', '+1 (555) 567-2222', 'active'),
        ('STU-1005', 'William Brown', 'william.b@nexuscampus.edu', '+1 (555) 678-9012', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150', 'B.Sc. Computer Science & AI', '2024-2028', 'Semester 3', 3.60, 85.4, 'paid', 0, 'enrolled', 'Prof. Margaret Hamilton', 'Robert Brown', '+1 (555) 678-3333', 'active')
        ON CONFLICT (id) DO NOTHING;
    """)

    # Seed Staff
    d_cur.execute("""
        INSERT INTO staff (id, name, email, role, department, avatar, joining_date, status, salary_band, courses_count)
        VALUES 
        ('FAC-01', 'Dr. Alan Turing', 'a.turing@nexuscampus.edu', 'Professor & Dean of Computing', 'Computer Science', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', '2021-08-15', 'active', 'Tier 1 ($145,000)', 3),
        ('FAC-02', 'Prof. Margaret Hamilton', 'm.hamilton@nexuscampus.edu', 'Associate Professor', 'Software Engineering', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150', '2022-01-10', 'active', 'Tier 2 ($120,000)', 2),
        ('FAC-03', 'Dr. Katherine Johnson', 'k.johnson@nexuscampus.edu', 'Head of Mathematics', 'Applied Mathematics', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', '2020-07-01', 'active', 'Tier 1 ($140,000)', 4),
        ('FAC-04', 'Sarah Jenkins', 'sarah.j@nexuscampus.edu', 'HR Talent Acquisition Lead', 'Administration', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', '2022-03-15', 'active', 'Tier 3 ($95,000)', 0),
        ('FAC-05', 'Kevin Mitnick', 'kevin.m@nexuscampus.edu', 'Principal Cybersecurity Engineer', 'IT Support', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150', '2023-01-20', 'active', 'Tier 2 ($125,000)', 1),
        ('FAC-06', 'Prof. Donald Knuth', 'donald.k@nexuscampus.edu', 'Professor Emeritus', 'Applied Mathematics', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150', '2019-09-01', 'on_leave', 'Tier 1 ($150,000)', 2)
        ON CONFLICT (id) DO NOTHING;
    """)

    # Seed Courses
    d_cur.execute("""
        INSERT INTO courses (id, code, title, category, instructor_id, instructor_name, enrolled_students, rating, modules_count, status)
        VALUES 
        ('CRS-101', 'CS-301', 'Introduction to Artificial Intelligence & Neural Networks', 'Computer Science', 'FAC-01', 'Dr. Alan Turing', 142, 4.9, 8, 'published'),
        ('CRS-102', 'SE-204', 'Advanced Cloud Distributed Systems Architecture', 'Software Engineering', 'FAC-02', 'Prof. Margaret Hamilton', 98, 4.8, 6, 'published'),
        ('CRS-103', 'MTH-310', 'Discrete Mathematics & Modern Cryptography', 'Applied Mathematics', 'FAC-03', 'Dr. Katherine Johnson', 110, 4.7, 10, 'published'),
        ('CRS-104', 'SEC-402', 'Cybersecurity Incident Response & Red Team Ops', 'Cybersecurity', 'FAC-05', 'Kevin Mitnick', 84, 4.9, 8, 'published')
        ON CONFLICT (id) DO NOTHING;
    """)

    # Seed Invoices
    d_cur.execute("""
        INSERT INTO invoices (id, student_id, student_name, fee_type, amount, paid_amount, due_date, status)
        VALUES 
        ('INV-2026-001', 'STU-1001', 'Emma Watson', 'Tuition Fee — Term 1', 6500, 6500, '2026-09-30', 'Paid'),
        ('INV-2026-002', 'STU-1002', 'Liam Smith', 'Tuition Fee — Term 1', 4800, 0, '2026-09-25', 'Pending'),
        ('INV-2026-003', 'STU-1003', 'Noah Johnson', 'Hostel Fee', 1200, 0, '2026-08-31', 'Overdue'),
        ('INV-2026-004', 'STU-1004', 'Olivia Williams', 'Lab & Library Fee', 350, 350, '2026-09-20', 'Paid'),
        ('INV-2026-005', 'STU-1005', 'William Brown', 'Tuition Fee — Term 1', 6500, 6500, '2026-09-30', 'Paid'),
        ('INV-2026-006', 'STU-1008', 'Sophia Martinez', 'Exam Fee', 450, 0, '2026-08-25', 'Overdue')
        ON CONFLICT (id) DO NOTHING;
    """)

    # Seed 64 Module Records from mock-platform data directory if present
    mock_data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "mock-platform", "data")
    if os.path.exists(mock_data_dir):
        print(f"[*] Seeding 64 module datasets from {mock_data_dir}...")
        for filename in os.listdir(mock_data_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(mock_data_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    mod_id = data.get("moduleId", "M01")
                    for rec in data.get("records", []):
                        d_cur.execute("""
                            INSERT INTO module_records (id, module_id, name, reference_code, scope, status, tags, notes, student_id, cohort)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (id) DO NOTHING;
                        """, (
                            rec.get("id"),
                            mod_id,
                            rec.get("name"),
                            rec.get("referenceCode"),
                            rec.get("scope"),
                            rec.get("status", "active"),
                            json.dumps(rec.get("tags", [])),
                            rec.get("notes", ""),
                            rec.get("studentId"),
                            rec.get("cohort")
                        ))
                    for wf in data.get("workflows", []):
                        d_cur.execute("""
                            INSERT INTO module_workflows (id, module_id, title, status, actor, timestamp)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (id) DO NOTHING;
                        """, (
                            wf.get("id"),
                            mod_id,
                            wf.get("title"),
                            wf.get("status", "completed"),
                            wf.get("actor", "Automation Engine"),
                            wf.get("timestamp", "Recent")
                        ))
                except Exception as e:
                    print(f"[!] Warning reading {filename}: {e}")

    d_cur.close()
    demo_conn.close()
    print("[OK] All database schemas and rich institutional datasets initialized successfully!")

if __name__ == "__main__":
    run_init()
