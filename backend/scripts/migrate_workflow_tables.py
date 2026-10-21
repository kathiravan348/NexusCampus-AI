import json
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DB_HOST = "localhost"
DB_PORT = 5432
DB_USER = "postgres"
DB_PASSWORD = "postgrespassword"

def migrate_database(db_name: str):
    print(f"[*] Migrating workflow tables in {db_name}...")
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
        # 1. Library Loans Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS library_loans (
                id VARCHAR(50) PRIMARY KEY,
                book_id VARCHAR(50) NOT NULL,
                book_title VARCHAR(255) NOT NULL,
                isbn VARCHAR(50),
                student_id VARCHAR(50) NOT NULL,
                student_name VARCHAR(255) NOT NULL,
                loan_days INT DEFAULT 14,
                issue_date VARCHAR(50) NOT NULL,
                due_date VARCHAR(50) NOT NULL,
                return_date VARCHAR(50),
                status VARCHAR(50) NOT NULL DEFAULT 'pending_approval', -- pending_approval, active, returned, overdue
                fine_amount NUMERIC(10,2) DEFAULT 0.0,
                renewed_count INT DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Initial seed loans
            INSERT INTO library_loans (id, book_id, book_title, isbn, student_id, student_name, loan_days, issue_date, due_date, status, fine_amount)
            VALUES 
                ('LN-1001', 'BK-102', 'Introduction to Algorithms (CLRS)', '978-0262033848', 'STU-1001', 'Emma Watson', 14, '2026-09-01', '2026-09-15', 'active', 0.0),
                ('LN-1002', 'BK-103', 'Effective Java (3rd Edition)', '978-0134685991', 'STU-1001', 'Emma Watson', 14, '2026-08-10', '2026-08-24', 'returned', 0.0),
                ('LN-1003', 'BK-104', 'Operating System Concepts (10th Ed)', '978-1118063330', 'STU-1002', 'Liam Smith', 14, '2026-08-20', '2026-09-03', 'overdue', 6.0)
            ON CONFLICT (id) DO NOTHING;
        """)

        # 2. Student Leaves Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS student_leaves (
                id VARCHAR(50) PRIMARY KEY,
                student_id VARCHAR(50) NOT NULL,
                student_name VARCHAR(255) NOT NULL,
                leave_type VARCHAR(50) NOT NULL, -- Medical, Personal, Academic
                start_date VARCHAR(50) NOT NULL,
                end_date VARCHAR(50) NOT NULL,
                days_count INT DEFAULT 1,
                reason TEXT NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
                reviewed_by VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            INSERT INTO student_leaves (id, student_id, student_name, leave_type, start_date, end_date, days_count, reason, status, reviewed_by)
            VALUES 
                ('LV-201', 'STU-1001', 'Emma Watson', 'Academic Conference', '2026-09-20', '2026-09-22', 3, 'Attending IEEE AI Symposium presentation', 'approved', 'Dr. Alan Turing'),
                ('LV-202', 'STU-1003', 'Noah Johnson', 'Medical', '2026-09-10', '2026-09-11', 2, 'Recovery from flu symptoms', 'approved', 'Dr. Alan Turing')
            ON CONFLICT (id) DO NOTHING;
        """)

        # 3. Course Grades Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS course_grades (
                id VARCHAR(50) PRIMARY KEY,
                course_code VARCHAR(50) NOT NULL,
                course_title VARCHAR(255) NOT NULL,
                student_id VARCHAR(50) NOT NULL,
                student_name VARCHAR(255) NOT NULL,
                credits INT DEFAULT 4,
                internal_score NUMERIC(5,2) DEFAULT 0,
                final_score NUMERIC(5,2) DEFAULT 0,
                total_score NUMERIC(5,2) DEFAULT 0,
                letter_grade VARCHAR(10) DEFAULT 'A',
                gpa_points NUMERIC(3,2) DEFAULT 4.0,
                status VARCHAR(50) NOT NULL DEFAULT 'published', -- draft, submitted, published
                moderated_by VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            INSERT INTO course_grades (id, course_code, course_title, student_id, student_name, credits, internal_score, final_score, total_score, letter_grade, gpa_points, status, moderated_by)
            VALUES 
                ('GR-301', 'CS-101', 'Advanced Algorithms & Data Structures', 'STU-1001', 'Emma Watson', 4, 38.5, 56.0, 94.5, 'A+', 4.0, 'published', 'Prof. Donald Knuth'),
                ('GR-302', 'AI-201', 'Neural Networks & Deep Learning', 'STU-1001', 'Emma Watson', 4, 37.0, 54.5, 91.5, 'A', 3.9, 'published', 'Prof. Donald Knuth'),
                ('GR-303', 'CS-301', 'Distributed Cloud Architecture', 'STU-1001', 'Emma Watson', 3, 36.0, 52.0, 88.0, 'A-', 3.7, 'published', 'Prof. Donald Knuth'),
                ('GR-304', 'MA-201', 'Discrete Mathematics & Logic', 'STU-1001', 'Emma Watson', 3, 35.5, 51.0, 86.5, 'B+', 3.5, 'published', 'Prof. Donald Knuth')
            ON CONFLICT (id) DO NOTHING;
        """)

        # 4. Placement Drives Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS placement_drives (
                id VARCHAR(50) PRIMARY KEY,
                company_name VARCHAR(255) NOT NULL,
                logo_url VARCHAR(500),
                role_title VARCHAR(255) NOT NULL,
                ctc_package VARCHAR(100) NOT NULL,
                min_gpa NUMERIC(3,2) DEFAULT 3.0,
                location VARCHAR(100) DEFAULT 'Hybrid / Remote',
                drive_date VARCHAR(50) NOT NULL,
                status VARCHAR(50) DEFAULT 'open',
                openings INT DEFAULT 8
            );

            INSERT INTO placement_drives (id, company_name, role_title, ctc_package, min_gpa, location, drive_date, status, openings)
            VALUES 
                ('DRV-01', 'Google', 'Associate AI/ML Software Engineer', '$165,000 / yr', 3.5, 'Mountain View / Hybrid', '2026-10-15', 'open', 12),
                ('DRV-02', 'Microsoft', 'Software Development Engineer II', '$150,000 / yr', 3.4, 'Redmond, WA', '2026-10-22', 'open', 15),
                ('DRV-03', 'OpenAI', 'Research Resident (GenAI Infrastructure)', '$185,000 / yr', 3.7, 'San Francisco, CA', '2026-11-05', 'open', 6),
                ('DRV-04', 'Amazon Web Services', 'Cloud Solutions Architect', '$140,000 / yr', 3.2, 'Seattle, WA', '2026-10-28', 'open', 20),
                ('DRV-05', 'Deloitte Digital', 'Technology Strategy Consultant', '$115,000 / yr', 3.0, 'New York, NY', '2026-11-12', 'open', 25)
            ON CONFLICT (id) DO NOTHING;

            CREATE TABLE IF NOT EXISTS placement_applications (
                id VARCHAR(50) PRIMARY KEY,
                drive_id VARCHAR(50) NOT NULL,
                company_name VARCHAR(255) NOT NULL,
                role_title VARCHAR(255) NOT NULL,
                student_id VARCHAR(50) NOT NULL,
                student_name VARCHAR(255) NOT NULL,
                stage VARCHAR(50) NOT NULL DEFAULT 'applied', -- applied, shortlisted, technical_round, offered, accepted
                offer_package VARCHAR(100),
                applied_date VARCHAR(50) NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            INSERT INTO placement_applications (id, drive_id, company_name, role_title, student_id, student_name, stage, offer_package, applied_date)
            VALUES 
                ('APP-901', 'DRV-01', 'Google', 'Associate AI/ML Software Engineer', 'STU-1001', 'Emma Watson', 'shortlisted', '$165,000 / yr', '2026-09-05'),
                ('APP-902', 'DRV-02', 'Microsoft', 'Software Development Engineer II', 'STU-1001', 'Emma Watson', 'offered', '$150,000 / yr', '2026-09-01')
            ON CONFLICT (id) DO NOTHING;
        """)

        print(f"    [OK] {db_name}: 5 workflow tables and seed records initialized.")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    target_dbs = ["nexus_default_demo", "nexus_tenant_greenwood", "nexus_tenant_oxfordbay"]
    for db in target_dbs:
        try:
            migrate_database(db)
        except Exception as e:
            print(f"    [WARN] Failed to migrate {db}: {e}")
    print("\n[OK] All workflow migrations finished successfully.")
