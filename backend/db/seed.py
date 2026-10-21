"""
Deterministic demo seed for the tenant TEMPLATE database.
- Runs as DB admin inside the template (tenant_id defaults from the database-level setting).
- Dates are relative to the day the seed runs, so the demo never looks stale.
- Rows are marked source='import' (historical data load); runtime tables stay empty.
- Every persona account uses password demo123.
"""
import json
import random
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from services.common.grading import gpa_from_courses, letter_for, weighted_percent
from services.common.modules_catalog import GENERIC_MODULES, MODULES
from services.common.rbac import SYSTEM_ROLES
from services.common.security import encrypt_field, hash_password
from services.common.workflow import DEFAULT_DEFINITIONS

UTC = timezone.utc
DEMO_PASSWORD = "demo123"
SEED_DIR = Path(__file__).resolve().parent / "seed_data" / "modules"
PERIODS = [(time(9, 0), time(10, 0)), (time(10, 15), time(11, 15)), (time(11, 30), time(12, 30)),
           (time(13, 30), time(14, 30)), (time(14, 45), time(15, 45))]

FIRST_F = ["Olivia", "Ava", "Sophia", "Isabella", "Mia", "Ananya", "Zara", "Chloe", "Priya", "Amara", "Layla", "Elena",
           "Sakura", "Grace", "Nadia", "Hana", "Ines", "Maya", "Leila", "Freya", "Aisha", "Clara", "Ruby", "Alina"]
FIRST_M = ["Liam", "Noah", "Ethan", "Mason", "Lucas", "Aarav", "Mateo", "Leo", "Arjun", "Kai", "Omar", "Hugo",
           "Ravi", "Daniel", "Felix", "Tariq", "Jonas", "Diego", "Ibrahim", "Oscar", "Theo", "Samir", "Elias", "Rohan"]
LAST = ["Smith", "Johnson", "Williams", "Brown", "Garcia", "Patel", "Nguyen", "Kim", "Okonkwo", "Rossi", "Silva",
        "Khan", "Mueller", "Chen", "Singh", "Lopez", "Tanaka", "Novak", "Iyer", "Kowalski", "Adeyemi", "Larsen",
        "Costa", "Dubois", "Murphy", "Schmidt", "Yilmaz", "Mensah", "Ivanova", "Fernandes", "Sato", "Bianchi"]
PARENT_M = ["David", "Michael", "Sanjay", "Hiroshi", "Carlos", "Ahmed", "Peter", "Kwame", "Lars", "Marco", "Joseph", "Ramesh"]
PARENT_F = ["Susan", "Meera", "Yuki", "Fatima", "Laura", "Grace", "Anita", "Helena", "Maria", "Chen", "Ngozi", "Sofia"]

STAFF = [
    # key, name, email, designation, dept, grade, salary, role, login_email, persona(title, desc, order), sub_pool
    ("principal", "Dr. Evelyn Carter", "evelyn.carter@nexuscampus.edu", "Principal", "ADM", "G1", 185000, "admin",
     "admin@nexuscampus.edu", ("Institution Admin", "Principal · full control across all modules", 1), False),
    ("turing", "Dr. Alan Turing", "alan.turing@nexuscampus.edu", "Professor of Computer Science", "CSE", "G1", 145000,
     "teacher", "teacher@nexuscampus.edu", ("Teacher / Faculty", "Teaches CS-301 Data Structures (Emma's class)", 2), False),
    ("hopper", "Dr. Grace Hopper", "grace.hopper@nexuscampus.edu", "Head, School of Computing", "CSE", "G1", 160000,
     "hod", "hod@nexuscampus.edu", ("Head of Department", "Reviews marks, approves syllabus & staff leave", 5), False),
    ("hamilton", "Prof. Margaret Hamilton", "margaret.hamilton@nexuscampus.edu", "Associate Professor, Software Engineering",
     "CSE", "G2", 120000, "teacher", None, None, False),
    ("weiss", "Dr. Hannah Weiss", "hannah.weiss@nexuscampus.edu", "Assistant Professor, Networks", "CSE", "G2", 98000,
     "teacher", None, None, True),
    ("johnson", "Dr. Katherine Johnson", "katherine.johnson@nexuscampus.edu", "Head of Mathematics", "MTH", "G1", 140000,
     "hod", None, None, False),
    ("reyes", "Dr. Samuel Reyes", "samuel.reyes@nexuscampus.edu", "Assistant Professor, Statistics", "MTH", "G2", 96000,
     "teacher", None, None, True),
    ("knuth", "Prof. Donald Knuth", "donald.knuth@nexuscampus.edu", "Controller of Examinations", "MTH", "G1", 150000,
     "exam_controller", "examiner@nexuscampus.edu", ("Chief Examiner", "Schedules exams & publishes report cards", 6), False),
    ("svensson", "Dr. Ingrid Svensson", "ingrid.svensson@nexuscampus.edu", "Dean, School of Business", "BUS", "G1", 150000,
     "hod", None, None, False),
    ("haddad", "Dr. Omar Haddad", "omar.haddad@nexuscampus.edu", "Associate Professor, Marketing", "BUS", "G2", 112000,
     "teacher", None, None, False),
    ("moreno", "Dr. Lucia Moreno", "lucia.moreno@nexuscampus.edu", "Head, School of Engineering", "ENG", "G1", 152000,
     "hod", None, None, False),
    ("watanabe", "Dr. Kenji Watanabe", "kenji.watanabe@nexuscampus.edu", "Associate Professor, Robotics", "ENG", "G2", 118000,
     "teacher", None, None, False),
    ("clarke", "Dr. Amelia Clarke", "amelia.clarke@nexuscampus.edu", "Head of Psychology", "PSY", "G1", 138000, "hod",
     None, None, False),
    ("jenkins", "Sarah Jenkins", "sarah.jenkins@nexuscampus.edu", "HR Manager", "ADM", "G3", 95000, "hr_manager",
     "hr@nexuscampus.edu", ("HR Manager", "Staff lifecycle, leave & payroll preparation", 8), False),
    ("vance", "Marcus Vance", "marcus.vance@nexuscampus.edu", "Head of Career Services", "ADM", "G3", 92000,
     "placement_officer", "placement@nexuscampus.edu", ("Placement Officer", "Companies, drives, shortlists & offers", 9), False),
    ("raman", "Priya Raman", "priya.raman@nexuscampus.edu", "Senior Accountant", "ADM", "G3", 88000, "accountant",
     "accountant@nexuscampus.edu", ("Accountant", "Invoices, payments, refunds & payroll sign-off", 7), False),
    ("castillo", "Nora Castillo", "nora.castillo@nexuscampus.edu", "Chief Librarian", "ADM", "G3", 72000, "librarian",
     "librarian@nexuscampus.edu", ("Librarian", "Catalogue, circulation & fines", 10), False),
    ("park", "Dr. Helen Park", "helen.park@nexuscampus.edu", "Student Counsellor", "PSY", "G3", 82000, "counsellor",
     "counsellor@nexuscampus.edu", ("Student Counsellor", "Confidential wellbeing casework", 11), False),
    ("okafor", "Amara Okafor", "amara.okafor@nexuscampus.edu", "Campus Nurse", "ADM", "G4", 64000, "clinic_staff",
     "clinic@nexuscampus.edu", ("Clinic Staff", "Student health records", 12), False),
    ("menon", "Rahul Menon", "rahul.menon@nexuscampus.edu", "Hostel Warden", "ADM", "G4", 60000, "warden",
     "warden@nexuscampus.edu", ("Hostel Warden", "Allotments, movements & complaints", 13), False),
    ("alvarez", "Diego Alvarez", "diego.alvarez@nexuscampus.edu", "Transport Manager", "ADM", "G4", 62000,
     "transport_manager", "transport@nexuscampus.edu", ("Transport Manager", "Fleet, routes, live trips & SOS", 14), False),
    ("osei", "Victor Osei", "victor.osei@nexuscampus.edu", "Chief of Security", "ADM", "G4", 61000, "security_head",
     "security@nexuscampus.edu", ("Security Head", "Gate passes, watchlist & incidents", 15), False),
    ("farouk", "Lina Farouk", "lina.farouk@nexuscampus.edu", "Canteen Manager", "ADM", "G4", 52000, "canteen_vendor",
     "canteen@nexuscampus.edu", ("Canteen Manager", "Menu & cashless POS", 16), False),
    ("brooks", "Leah Brooks", "leah.brooks@nexuscampus.edu", "Admissions Counsellor", "ADM", "G4", 58000,
     "admissions_counsellor", "admissions@nexuscampus.edu", ("Admissions Counsellor", "Enquiries & applications", 17), False),
    ("becker", "Tom Becker", "tom.becker@nexuscampus.edu", "Store Manager", "ADM", "G4", 56000, "store_manager",
     "store@nexuscampus.edu", ("Store Manager", "Stock, requisitions & GRN", 18), False),
]
DEPARTMENTS = [("CSE", "School of Computing", "hopper"), ("BUS", "School of Business", "svensson"),
               ("ENG", "School of Engineering", "moreno"), ("PSY", "Department of Psychology", "clarke"),
               ("MTH", "Department of Mathematics", "johnson"), ("ADM", "Administration & Services", "principal")]
PROGRAMMES = [("BSC-CSAI", "B.Sc. Computer Science & AI", "CS", "CSE", 4, 6500),
              ("BBA-DB", "BBA Digital Business", "BA", "BUS", 3, 5200),
              ("BENG-RAS", "B.Eng. Robotics & Autonomous Systems", "RB", "ENG", 4, 7200),
              ("BSC-PSY", "B.Sc. Cognitive Psychology", "PS", "PSY", 4, 5800)]
COURSES = {
    "BSC-CSAI": [(1, "CS-101", "Programming Fundamentals", "turing", 4), (1, "MTH-101", "Calculus I", "reyes", 3),
                 (1, "CS-102", "Digital Logic", "hamilton", 3),
                 (3, "CS-301", "Data Structures & Algorithms", "turing", 4), (3, "CS-302", "Database Systems", "hamilton", 4),
                 (3, "MTH-301", "Discrete Mathematics", "johnson", 3),
                 (5, "CS-501", "Machine Learning", "hopper", 4), (5, "CS-502", "Distributed Systems", "hamilton", 4),
                 (5, "CS-503", "Computer Networks", "weiss", 3)],
    "BBA-DB": [(1, "BUS-101", "Principles of Management", "svensson", 3), (1, "BUS-102", "Business Communication", "haddad", 3),
               (1, "MTH-102", "Business Statistics", "reyes", 3),
               (3, "BUS-301", "Digital Marketing", "haddad", 4), (3, "BUS-302", "Financial Accounting", "svensson", 4),
               (3, "BUS-303", "E-Commerce Systems", "weiss", 3),
               (5, "BUS-501", "Strategic Management", "svensson", 4), (5, "BUS-502", "Business Analytics", "haddad", 4),
               (5, "BUS-503", "Entrepreneurship", "haddad", 3)],
    "BENG-RAS": [(1, "ENG-101", "Engineering Mechanics", "watanabe", 4), (1, "MTH-103", "Linear Algebra", "johnson", 3),
                 (1, "ENG-102", "Electrical Circuits", "moreno", 3),
                 (3, "ENG-301", "Control Systems", "moreno", 4), (3, "ENG-302", "Embedded Systems", "watanabe", 4),
                 (3, "CS-304", "Programming for Robotics", "turing", 3),
                 (5, "ENG-501", "Autonomous Navigation", "moreno", 4), (5, "ENG-502", "Computer Vision", "hopper", 4),
                 (5, "ENG-503", "Robot Kinematics", "watanabe", 3)],
    "BSC-PSY": [(1, "PSY-101", "Introduction to Psychology", "clarke", 4), (1, "PSY-102", "Research Methods", "clarke", 3),
                (1, "MTH-104", "Statistics for Social Sciences", "reyes", 3),
                (3, "PSY-301", "Cognitive Neuroscience", "clarke", 4), (3, "PSY-302", "Developmental Psychology", "clarke", 4),
                (3, "PSY-303", "Human-Computer Interaction", "hamilton", 3),
                (5, "PSY-501", "Clinical Psychology", "clarke", 4), (5, "PSY-502", "Behavioural Economics", "haddad", 3),
                (5, "PSY-503", "Psychometrics", "reyes", 3)],
}
PREVIOUS_TERM_COURSES = {
    "BSC-CSAI": [("CS-201", "Object-Oriented Programming", 4), ("CS-202", "Computer Organisation", 3), ("MTH-201", "Probability", 3)],
    "BBA-DB": [("BUS-201", "Organisational Behaviour", 3), ("BUS-202", "Microeconomics", 3), ("BUS-203", "Marketing Basics", 3)],
    "BENG-RAS": [("ENG-201", "Thermodynamics", 4), ("ENG-202", "Signals & Systems", 3), ("MTH-203", "Differential Equations", 3)],
    "BSC-PSY": [("PSY-201", "Social Psychology", 3), ("PSY-202", "Biological Psychology", 4), ("PSY-203", "Perception", 3)],
}
LIBRARY_BOOKS = [
    ("Introduction to Algorithms", "Cormen, Leiserson, Rivest, Stein", "MIT Press", "Computer Science", 2009, 4),
    ("Clean Code", "Robert C. Martin", "Prentice Hall", "Computer Science", 2008, 3),
    ("Designing Data-Intensive Applications", "Martin Kleppmann", "O'Reilly", "Computer Science", 2017, 3),
    ("Artificial Intelligence: A Modern Approach", "Russell & Norvig", "Pearson", "Computer Science", 2020, 3),
    ("Database System Concepts", "Silberschatz, Korth, Sudarshan", "McGraw Hill", "Computer Science", 2019, 3),
    ("Computer Networking: A Top-Down Approach", "Kurose & Ross", "Pearson", "Computer Science", 2021, 2),
    ("Pattern Recognition and Machine Learning", "Christopher Bishop", "Springer", "Computer Science", 2006, 2),
    ("The Pragmatic Programmer", "Hunt & Thomas", "Addison-Wesley", "Computer Science", 2019, 2),
    ("Operating System Concepts", "Silberschatz, Galvin, Gagne", "Wiley", "Computer Science", 2018, 3),
    ("Discrete Mathematics and Its Applications", "Kenneth Rosen", "McGraw Hill", "Mathematics", 2018, 3),
    ("Linear Algebra Done Right", "Sheldon Axler", "Springer", "Mathematics", 2015, 2),
    ("Calculus: Early Transcendentals", "James Stewart", "Cengage", "Mathematics", 2015, 3),
    ("Marketing Management", "Kotler & Keller", "Pearson", "Business", 2016, 3),
    ("Financial Accounting", "Weygandt, Kimmel, Kieso", "Wiley", "Business", 2018, 2),
    ("Good Strategy Bad Strategy", "Richard Rumelt", "Crown Business", "Business", 2011, 2),
    ("The Lean Startup", "Eric Ries", "Crown Business", "Business", 2011, 2),
    ("Modern Control Engineering", "Katsuhiko Ogata", "Pearson", "Engineering", 2009, 2),
    ("Probabilistic Robotics", "Thrun, Burgard, Fox", "MIT Press", "Engineering", 2005, 1),
    ("Embedded Systems: Real-Time Interfacing", "Jonathan Valvano", "CreateSpace", "Engineering", 2017, 2),
    ("Introduction to Robotics: Mechanics and Control", "John J. Craig", "Pearson", "Engineering", 2017, 2),
    ("Cognitive Psychology", "E. Bruce Goldstein", "Cengage", "Psychology", 2018, 3),
    ("Thinking, Fast and Slow", "Daniel Kahneman", "Farrar, Straus and Giroux", "Psychology", 2011, 3),
    ("Development Through the Lifespan", "Laura Berk", "Pearson", "Psychology", 2017, 2),
    ("The Design of Everyday Things", "Don Norman", "Basic Books", "Psychology", 2013, 2),
    ("Research Design", "John W. Creswell", "SAGE", "Psychology", 2017, 2),
    ("Statistics", "Freedman, Pisani, Purves", "W. W. Norton", "Mathematics", 2007, 2),
    ("To Kill a Mockingbird", "Harper Lee", "Harper Perennial", "Literature", 1960, 2),
    ("Sapiens", "Yuval Noah Harari", "Harper", "General", 2015, 2),
    ("The Gene: An Intimate History", "Siddhartha Mukherjee", "Scribner", "General", 2016, 1),
    ("Educated", "Tara Westover", "Random House", "Literature", 2018, 2),
]


class Seed:
    def __init__(self, conn):
        self.conn = conn
        self.rng = random.Random(2026)
        self.today = date.today()
        self.now = datetime.now(UTC)
        self.counters: dict[str, int] = {}
        self.summary: dict[str, int] = {}
        self.used_names: set[str] = set()

    # ---------------------------------------------------------------- helpers
    def code(self, key: str, prefix: str, width: int = 5) -> str:
        self.counters[key] = self.counters.get(key, 0) + 1
        return f"{prefix}{self.counters[key]:0{width}d}"

    async def ins(self, table: str, **cols):
        cols.setdefault("source", "import")
        keys = list(cols)
        sql = (f"INSERT INTO {table} ({', '.join(keys)}) VALUES "
               f"({', '.join('$' + str(i + 1) for i in range(len(keys)))}) RETURNING id")
        self.summary[table] = self.summary.get(table, 0) + 1
        return await self.conn.fetchval(sql, *cols.values())

    async def many(self, table: str, rows: list[dict]) -> None:
        if not rows:
            return
        keys = list(rows[0].keys())
        if "source" not in keys:
            keys.append("source")
        sql = (f"INSERT INTO {table} ({', '.join(keys)}) VALUES "
               f"({', '.join('$' + str(i + 1) for i in range(len(keys)))})")
        await self.conn.executemany(sql, [tuple(r.get(k, "import") for k in keys) for r in rows])
        self.summary[table] = self.summary.get(table, 0) + len(rows)

    def dt(self, d: date, hh: int = 9, mm: int = 0) -> datetime:
        return datetime.combine(d, time(hh, mm), tzinfo=UTC)

    def ago(self, **kw) -> datetime:
        return self.now - timedelta(**kw)

    def school_day(self, d: date) -> bool:
        return d.isoweekday() <= 5 and d not in self.holiday_dates

    def add_school_days(self, start: date, n: int) -> date:
        d = start
        step = 1 if n >= 0 else -1
        remaining = abs(n)
        while remaining:
            d += timedelta(days=step)
            if self.school_day(d):
                remaining -= 1
        return d

    def unique_name(self, gender: str, last: str | None = None) -> str:
        pool = FIRST_F if gender == "F" else FIRST_M
        for _ in range(500):
            name = f"{self.rng.choice(pool)} {last or self.rng.choice(LAST)}"
            if name not in self.used_names:
                self.used_names.add(name)
                return name
        raise RuntimeError("name pool exhausted")

    async def user(self, email, name, role, *, staff_id=None, student_id=None, guardian_id=None, persona=None, phone=None):
        cols = dict(email=email.lower(), name=name, password_hash=hash_password(DEMO_PASSWORD), role_key=role,
                    staff_id=staff_id, student_id=student_id, guardian_id=guardian_id, phone=phone,
                    password_changed_at=self.ago(days=30))
        if persona:
            cols.update(is_demo_persona=True, persona_title=persona[0], persona_description=persona[1],
                        persona_order=persona[2])
        return await self.ins("users", **cols)

    async def seed_workflow(self, wf_type, entity_type, entity_id, title, submitted_by, *, summary="", payload=None,
                            hours_ago=4, status="pending", decided_by=None, comment=None):
        definition = next(d for d in DEFAULT_DEFINITIONS if d[0] == wf_type)
        created = self.ago(hours=hours_ago)
        instance = await self.ins("workflow_instances", type=wf_type, entity_type=entity_type, entity_id=str(entity_id),
                                  title=title, summary=summary, status=status, current_step=1, payload=payload or {},
                                  submitted_by=submitted_by, created_by=submitted_by, created_at=created,
                                  decided_at=created + timedelta(hours=2) if status != "pending" else None)
        for number, (perm, label) in enumerate(definition[2], start=1):
            if status == "pending":
                step_status = "pending" if number == 1 else "waiting"
            else:
                step_status = "approved" if status == "approved" else ("rejected" if number == 1 else "skipped")
            await self.ins("workflow_steps", instance_id=instance, step_no=number, label=label, approver_permission=perm,
                           status=step_status, created_at=created,
                           due_at=created + timedelta(hours=float(definition[3])) if step_status == "pending" else None,
                           decided_by=decided_by if step_status in ("approved", "rejected") else None,
                           decided_at=created + timedelta(hours=2) if step_status in ("approved", "rejected") else None,
                           comment=comment if step_status in ("approved", "rejected") else None)
        return instance

    # ---------------------------------------------------------------- run
    async def run(self) -> dict:
        await self.platform()
        await self.people()
        await self.academics()
        await self.students()
        await self.timetable()
        await self.leaves()
        await self.attendance()
        await self.gradebook()
        await self.exams()
        await self.fees()
        await self.admissions()
        await self.communication()
        await self.hr_payroll()
        await self.library()
        await self.placement()
        await self.hostel()
        await self.transport()
        await self.cafeteria()
        await self.inventory()
        await self.security()
        await self.wellbeing()
        await self.accreditation()
        await self.lms()
        await self.service_desk()
        await self.generic_modules()
        await self.pending_workflows()
        for key, value in self.counters.items():
            await self.conn.execute("INSERT INTO code_sequences (key, value) VALUES ($1, $2)", key, value)
        return {k: v for k, v in sorted(self.summary.items()) if k in (
            "users", "students", "staff", "course_sections", "attendance_records", "marks", "invoices", "payments",
            "library_loans", "module_records", "workflow_instances", "wallet_transactions")}

    # ---------------------------------------------------------------- platform
    async def platform(self):
        for key, (name, description, perms) in SYSTEM_ROLES.items():
            await self.ins("roles", key=key, name=name, description=description, is_system=True, permissions=perms)
        for wf_type, name, steps, sla in DEFAULT_DEFINITIONS:
            await self.ins("workflow_definitions", type=wf_type, name=name, sla_hours=sla,
                           steps=[{"permission": p, "label": l} for p, l in steps])
        for code, name, portal, kind in MODULES:
            await self.ins("feature_flags", module_code=code, name=name, portal=portal, kind=kind)
        await self.ins("institution", name="Nexus Campus Institute of Technology",
                       legal_name="Nexus Campus Educational Trust", short_code="NCIT", country="United States",
                       currency="USD", timezone="UTC", contact_email="office@nexuscampus.edu",
                       contact_phone="+1 555 010 0100", address="1 Innovation Way, Springfield",
                       domain="nexuscampus.edu")
        self.campus_main = await self.ins("campuses", code="NC", name="North Campus", city="Springfield",
                                          address="1 Innovation Way", is_main=True)
        self.campus_city = await self.ins("campuses", code="CC", name="City Campus", city="Springfield",
                                          address="220 Market Street")
        self.dept = {}
        for code, name, _head in DEPARTMENTS:
            self.dept[code] = await self.ins("departments", code=code, name=name, campus_id=self.campus_main)

        t = self.today
        y = t.year if t.month >= 7 else t.year - 1
        self.ay_name = f"{y}-{y + 1}"
        self.ay_prev = await self.ins("academic_years", name=f"{y - 1}-{y}", start_date=date(y - 1, 7, 1),
                                      end_date=date(y, 6, 30), status="closed", closed_at=self.dt(date(y, 7, 1)))
        self.ay = await self.ins("academic_years", name=self.ay_name, start_date=date(y, 7, 1),
                                 end_date=date(y + 1, 6, 30), status="active")
        await self.ins("terms", academic_year_id=self.ay_prev, name="Term 2", start_date=date(y, 1, 10), end_date=date(y, 5, 31))
        term1 = (date(y, 7, 15), date(y, 12, 15))
        term2 = (date(y + 1, 1, 10), date(y + 1, 5, 31))
        t1 = await self.ins("terms", academic_year_id=self.ay, name="Term 1", start_date=term1[0], end_date=term1[1])
        t2 = await self.ins("terms", academic_year_id=self.ay, name="Term 2", start_date=term2[0], end_date=term2[1])
        if t <= date(y, 12, 20):
            self.term, (self.term_start, self.term_end), self.term_name = t1, term1, "Term 1"
            self.next_term_start = term2[0]
        else:
            self.term, (self.term_start, self.term_end), self.term_name = t2, term2, "Term 2"
            self.next_term_start = date(y + 1, 7, 15)
        self.term_label = f"{self.ay_name} {self.term_name}"
        self.prev_term_label = f"{y - 1}-{y} Term 2" if self.term_name == "Term 1" else f"{self.ay_name} Term 1"

        holidays = [(8, 15, "Independence Day"), (10, 2, "Founders' Day"), (11, 26, "Thanksgiving Break"),
                    (11, 27, "Thanksgiving Break"), (12, 25, "Winter Break"), (1, 1, "New Year's Day"),
                    (3, 14, "Spring Festival")]
        self.holiday_dates = set()
        for month, day, name in holidays:
            d = date(y if month >= 7 else y + 1, month, day)
            self.holiday_dates.add(d)
            await self.ins("holidays", holiday_date=d, name=name)
        for code, name, hra, da, pf, tax in [("G1", "Senior Faculty & Leadership", 20, 10, 12, 20),
                                              ("G2", "Faculty", 18, 10, 12, 15),
                                              ("G3", "Professional Staff", 15, 8, 12, 10),
                                              ("G4", "Support Staff", 10, 6, 12, 5)]:
            await self.ins("salary_grades", code=code, name=name, hra_pct=hra, da_pct=da, pf_pct=pf, tax_pct=tax)

    # ---------------------------------------------------------------- people
    async def people(self):
        self.staff, self.staff_user, self.staff_rows = {}, {}, {}
        for key, name, email, designation, dept, grade, salary, role, login, persona, pool in STAFF:
            staff_id = await self.ins("staff", staff_no=self.code("staff", "STF-", 4), name=name, email=email,
                                      phone=f"+1 555 02{len(self.staff):02d} {self.rng.randint(1000, 9999)}",
                                      department_id=self.dept[dept], designation=designation,
                                      joining_date=self.today - timedelta(days=self.rng.randint(400, 3000)),
                                      salary_grade_code=grade, base_salary=salary, is_substitute_pool=pool,
                                      campus_id=self.campus_main)
            self.staff[key] = staff_id
            self.staff_rows[key] = {"name": name, "role": role, "salary": salary, "grade": grade, "dept": dept}
            self.staff_user[key] = await self.user(login or email, name, role, staff_id=staff_id, persona=persona)
        for code, _name, head in DEPARTMENTS:
            await self.conn.execute("UPDATE departments SET head_staff_id = $1 WHERE id = $2", self.staff[head], self.dept[code])
        heads = {code: head for code, _n, head in DEPARTMENTS}
        for key, row in self.staff_rows.items():
            manager = "principal" if key in heads.values() or row["dept"] == "ADM" else heads[row["dept"]]
            if manager != key:
                await self.conn.execute("UPDATE staff SET manager_staff_id = $1 WHERE id = $2",
                                        self.staff[manager], self.staff[key])
        self.platform_user = await self.user("platform@nexuscampus.io", "Platform Operator", "super_admin",
                                             persona=("Platform Super Admin", "SaaS ops · provision, suspend & reset tenants", 19))

    # ---------------------------------------------------------------- academics
    async def academics(self):
        self.programmes, self.programme_meta = {}, {}
        for code, name, short, dept, years, tuition in PROGRAMMES:
            pid = await self.ins("programmes", code=code, name=name, short_code=short, department_id=self.dept[dept],
                                 duration_years=years, intake_capacity=60)
            self.programmes[code] = pid
            self.programme_meta[code] = {"short": short, "tuition": tuition, "name": name}
        self.rooms = {}
        for code, name, kind, capacity in [("LH-101", "Lecture Hall 101", "lecture", 80), ("LH-102", "Lecture Hall 102", "lecture", 80),
                                           ("LH-103", "Lecture Hall 103", "lecture", 60), ("LH-104", "Lecture Hall 104", "lecture", 60),
                                           ("LH-105", "Lecture Hall 105", "lecture", 60), ("LH-106", "Lecture Hall 106", "lecture", 60),
                                           ("LAB-201", "Computing Lab 201", "lab", 40), ("LAB-202", "Robotics Lab 202", "lab", 40),
                                           ("LAB-203", "Psychology Lab 203", "lab", 30), ("LAB-204", "Electronics Lab 204", "lab", 40),
                                           ("SEM-301", "Seminar Room 301", "seminar", 25), ("SEM-302", "Seminar Room 302", "seminar", 25),
                                           ("EXH-001", "Examination Hall", "exam", 200)]:
            self.rooms[code] = await self.ins("rooms", code=code, name=name, room_type=kind, capacity=capacity,
                                              campus_id=self.campus_main)
        self.sections: list[dict] = []
        self.section_by_code: dict[str, dict] = {}
        lecture_rooms = [c for c in self.rooms if c.startswith("LH-")]
        for prog_code, courses in COURSES.items():
            dept_code = next(p[3] for p in PROGRAMMES if p[0] == prog_code)
            for index, (semester, code, title, teacher, credits) in enumerate(courses):
                course_dept = "MTH" if code.startswith("MTH") else ("CSE" if code.startswith("CS") else dept_code)
                course_id = await self.ins("courses", code=code, title=title, programme_id=self.programmes[prog_code],
                                           department_id=self.dept[course_dept], credits=credits, semester=semester,
                                           description=f"{title} — core course for {self.programme_meta[prog_code]['name']}, semester {semester}.")
                room = lecture_rooms[(len(self.sections)) % len(lecture_rooms)]
                section_id = await self.ins("course_sections", course_id=course_id, term_id=self.term, section_code="A",
                                            teacher_staff_id=self.staff[teacher], room_id=self.rooms[room], capacity=60)
                section = {"id": section_id, "course_id": course_id, "code": code, "title": title, "teacher": teacher,
                           "credits": credits, "semester": semester, "programme": prog_code, "room": room, "students": []}
                self.sections.append(section)
                self.section_by_code[code] = section
                units = ["Foundations and key terminology", "Core techniques and worked examples",
                         "Applied practice and lab work", "Case studies from industry", "Revision and assessment preparation"]
                content = (f"# {title}\n\n**Credits:** {credits} · **Semester:** {semester}\n\n## Learning outcomes\n"
                           f"- Explain the core ideas of {title.lower()}\n- Apply them to realistic problems\n"
                           f"- Communicate solutions clearly\n\n## Units\n" +
                           "\n".join(f"{i + 1}. {u}" for i, u in enumerate(units)) +
                           "\n\n## Assessment\nQuizzes 20% · Assignments 20% · Midterm 30% · Final 30%\n")
                await self.ins("syllabus_versions", course_id=course_id, version_no=1, title=f"{title} — v1",
                               content=content, status="published", published_at=self.dt(self.term_start - timedelta(days=20)))
                if code == "CS-301":
                    self.cs301_v2 = await self.ins(
                        "syllabus_versions", course_id=course_id, version_no=2, title=f"{title} — v2",
                        content=content.replace("5. Revision", "5. Graph algorithms lab\n6. Revision"),
                        status="pending_approval", submitted_by=self.staff_user["turing"])

    # ---------------------------------------------------------------- students
    async def students(self):
        y = int(self.ay_name[:4])
        self.students: list[dict] = []
        self.student_by_name: dict[str, dict] = {}
        named = {("BSC-CSAI", 3): [("Emma Watson", "F"), ("Liam Smith", "M"), ("Noah Johnson", "M")],
                 ("BBA-DB", 3): [("Olivia Williams", "F")], ("BENG-RAS", 3): [("William Brown", "M")]}
        for n, _g in [x for v in named.values() for x in v]:
            self.used_names.add(n)
        counts = {1: 4, 3: 8, 5: 6}
        for prog_code, _name, short, _dept, _years, _tuition in PROGRAMMES:
            for semester, count in counts.items():
                cohort = y - (semester - 1) // 2
                preset = list(named.get((prog_code, semester), []))
                for i in range(count):
                    if preset:
                        name, gender = preset.pop(0)
                    else:
                        gender = "F" if (i + semester) % 2 == 0 else "M"
                        name = self.unique_name(gender)
                    first, last = name.split(" ", 1)
                    roll = self.code(f"roll:{cohort}:{short}", f"NC{cohort % 100:02d}{short}", 3)
                    email = f"{first.lower()}.{last.lower().replace(' ', '')}@students.nexuscampus.edu"
                    ability = min(97.0, max(42.0, self.rng.gauss(77, 9)))
                    reliability = 0.94
                    if name == "Emma Watson":
                        ability, reliability = 92.0, 0.97
                    elif name == "Liam Smith":
                        ability, reliability = 57.0, 0.70
                    elif prog_code == "BBA-DB" and semester == 5 and i == 0:
                        reliability = 0.58
                    guardian_last = last
                    relationship = "Father" if self.rng.random() < 0.55 else "Mother"
                    if name == "Emma Watson":
                        guardian_name, relationship = "Arthur Watson", "Father"
                    else:
                        guardian_name = f"{self.rng.choice(PARENT_M if relationship == 'Father' else PARENT_F)} {guardian_last}"
                    phone = f"+1 555 1{self.rng.randint(10, 99)} {self.rng.randint(1000, 9999)}"
                    guardian_phone = f"+1 555 3{self.rng.randint(10, 99)} {self.rng.randint(1000, 9999)}"
                    missing_emergency = (prog_code == "BENG-RAS" and semester == 5 and i == 1)
                    admission = date(cohort, 7, 10)
                    sid = await self.ins(
                        "students", roll_no=roll, name=name, email=email, phone=phone,
                        dob=date(cohort - 18, self.rng.randint(1, 12), self.rng.randint(1, 28)), gender=gender,
                        programme_id=self.programmes[prog_code], cohort=cohort, current_semester=semester,
                        status="active", admission_date=admission,
                        address=f"{self.rng.randint(10, 999)} {self.rng.choice(['Oak', 'Maple', 'Cedar', 'Elm', 'Birch'])} Street, Springfield",
                        emergency_contact_name=None if missing_emergency else guardian_name,
                        emergency_contact_phone=None if missing_emergency else guardian_phone,
                        campus_id=self.campus_main, created_at=self.dt(admission))
                    gid = await self.ins("guardians", name=guardian_name, phone=guardian_phone,
                                         email=f"{guardian_name.split()[0].lower()}.{guardian_last.lower()}{len(self.students)}@mail.example.com",
                                         occupation=self.rng.choice(["Engineer", "Teacher", "Physician", "Business owner", "Accountant", "Designer"]))
                    await self.ins("guardian_student_links", guardian_id=gid, student_id=sid, relationship=relationship,
                                   is_emergency_contact=not missing_emergency)
                    student = {"id": sid, "name": name, "gender": gender, "programme": prog_code, "semester": semester,
                               "cohort": cohort, "ability": ability, "reliability": reliability, "guardian_id": gid,
                               "guardian_name": guardian_name, "roll": roll}
                    persona = ("Student", "Emma Watson · B.Sc. CS & AI, Semester 3", 3) if name == "Emma Watson" else None
                    student["user"] = await self.user("student@nexuscampus.edu" if persona else email, name, "student",
                                                      student_id=sid, persona=persona, phone=phone)
                    gpersona = ("Parent / Guardian", "Arthur Watson · guardian of Emma", 4) if name == "Emma Watson" else None
                    guardian_email = "parent@nexuscampus.edu" if gpersona else \
                        f"{guardian_name.split()[0].lower()}.{guardian_last.lower()}{len(self.students)}@mail.example.com"
                    student["guardian_user"] = await self.user(guardian_email, guardian_name, "parent", guardian_id=gid,
                                                               persona=gpersona, phone=guardian_phone)
                    await self.ins("id_cards", student_id=sid, card_no=self.code("idcard", "IDC-"),
                                   issued_at=self.dt(admission), valid_until=date(cohort + 4, 6, 30))
                    for doc_type, title in [("transfer_certificate", "Transfer Certificate"), ("photo_id", "Government Photo ID")]:
                        pending = doc_type == "photo_id" and prog_code == "BSC-PSY" and semester == 3 and i < 2
                        await self.ins("student_documents", student_id=sid, doc_type=doc_type, title=title, mandatory=True,
                                       status="pending" if pending else "verified",
                                       verified_at=None if pending else self.dt(admission + timedelta(days=3)),
                                       created_at=self.dt(admission))
                    self.students.append(student)
                    self.student_by_name[name] = student

        health = [("Emma Watson", "O+", "Peanuts", "", "normal", True),
                  ("Noah Johnson", "A+", "", "Mild asthma — carries inhaler", "normal", True),
                  ("Olivia Williams", "B-", "Bee stings (anaphylaxis) — EpiPen in bag", "", "critical", False)]
        named_health = {h[0] for h in health}
        for s in [x for x in self.students if x["name"] not in named_health][5:12]:
            health.append((s["name"], self.rng.choice(["A+", "B+", "O+", "AB+"]), "", "", "normal", True))
        for name, blood, allergies, conditions, severity, acknowledged in health:
            student = self.student_by_name[name]
            await self.ins("health_records", student_id=student["id"], blood_group=blood,
                           allergies_enc=encrypt_field(allergies), conditions_enc=encrypt_field(conditions),
                           immunisations=[{"name": "MMR", "date": "2012-05-01"}, {"name": "Tdap", "date": "2019-08-12"}],
                           severity=severity, created_at=self.ago(days=3),
                           clinic_acknowledged_at=self.ago(days=2) if acknowledged else None)
        self.emma = self.student_by_name["Emma Watson"]

        rows = []
        for student in self.students:
            for section in self.sections:
                if section["programme"] == student["programme"] and section["semester"] == student["semester"]:
                    rows.append({"section_id": section["id"], "student_id": student["id"]})
                    section["students"].append(student)
        await self.many("enrollments", rows)

    # ---------------------------------------------------------------- timetable
    async def timetable(self):
        self.timetable_id = await self.ins("timetables", term_id=self.term, name=f"{self.term_label} Master Timetable",
                                           status="published", published_at=self.dt(self.term_start - timedelta(days=5)),
                                           published_by=self.staff_user["principal"])
        room_busy, teacher_busy, group_busy = {}, {}, {}
        self.slots: list[dict] = []
        ordered = sorted(self.sections, key=lambda s: (s["code"] != "CS-301", s["semester"], s["code"]))
        combos = [(d, p) for p in range(len(PERIODS)) for d in range(1, 6)]
        for index, section in enumerate(ordered):
            group = (section["programme"], section["semester"])
            wanted = 5 if section["code"] == "CS-301" else 3
            used_days: set[int] = set()
            placed = 0
            start = (index * 7) % len(combos)
            candidates = combos[start:] + combos[:start]
            if section["code"] == "CS-301":
                candidates = [(d, 0) for d in range(1, 6)]
            for day, period in candidates:
                if placed == wanted:
                    break
                key = (day, period)
                if day in used_days or section["teacher"] in teacher_busy.get(key, set()) or group in group_busy.get(key, set()):
                    continue
                room = section["room"] if section["room"] not in room_busy.get(key, set()) else next(
                    (r for r in self.rooms if r.startswith("LH-") and r not in room_busy.get(key, set())), None)
                if not room:
                    continue
                start_t, end_t = PERIODS[period]
                slot_id = await self.ins("timetable_slots", timetable_id=self.timetable_id, section_id=section["id"],
                                         day_of_week=day, start_time=start_t, end_time=end_t, room_id=self.rooms[room])
                room_busy.setdefault(key, set()).add(room)
                teacher_busy.setdefault(key, set()).add(section["teacher"])
                group_busy.setdefault(key, set()).add(group)
                used_days.add(day)
                placed += 1
                self.slots.append({"id": slot_id, "section": section, "day": day, "start": start_t, "end": end_t})

    # ---------------------------------------------------------------- student leave requests
    async def leaves(self):
        olivia = self.student_by_name["Olivia Williams"]
        liam = self.student_by_name["Liam Smith"]
        past_start = self.add_school_days(self.today, -6)
        past_end = self.add_school_days(past_start, 1)
        self.excused = {(olivia["id"], d) for d in (past_start, past_end)}
        await self.ins("leave_requests", request_no=self.code("leave", "LV-"), student_id=olivia["id"], leave_type="Medical",
                       start_date=past_start, end_date=past_end, days=2, reason="Fever — doctor's note submitted",
                       status="approved", requested_by_user_id=olivia["guardian_user"],
                       reviewed_by_user_id=self.staff_user["haddad"], reviewed_at=self.dt(past_start, 8),
                       review_comment="Get well soon", created_at=self.dt(past_start - timedelta(days=1), 18))
        next_start = self.add_school_days(self.today, 4)
        self.liam_leave = await self.ins("leave_requests", request_no=self.code("leave", "LV-"), student_id=liam["id"],
                                         leave_type="Personal", start_date=next_start,
                                         end_date=self.add_school_days(next_start, 1), days=2,
                                         reason="Family wedding out of town", status="pending",
                                         requested_by_user_id=liam["guardian_user"], created_at=self.ago(hours=20))
        william = self.student_by_name["William Brown"]
        rejected_start = self.add_school_days(self.today, -12)
        await self.ins("leave_requests", request_no=self.code("leave", "LV-"), student_id=william["id"],
                       leave_type="Personal", start_date=rejected_start, end_date=rejected_start, days=1,
                       reason="Concert tickets", status="rejected", requested_by_user_id=william["user"],
                       reviewed_by_user_id=self.staff_user["moreno"], reviewed_at=self.dt(rejected_start - timedelta(days=1), 12),
                       review_comment="Clashes with the Control Systems lab assessment", created_at=self.dt(rejected_start - timedelta(days=2)))

    # ---------------------------------------------------------------- attendance history
    async def attendance(self):
        noah = self.student_by_name["Noah Johnson"]
        pattern_days = set()
        d = self.today
        while len(pattern_days) < 3:
            d -= timedelta(days=1)
            if self.school_day(d):
                pattern_days.add(d)
        records = []
        day = self.term_start
        slot_by_day: dict[int, list[dict]] = {}
        for slot in self.slots:
            slot_by_day.setdefault(slot["day"], []).append(slot)
        self.attendance_sample = None
        while day < self.today:
            if self.school_day(day):
                for slot in slot_by_day.get(day.isoweekday(), []):
                    section = slot["section"]
                    session = await self.ins("attendance_sessions", section_id=section["id"], session_date=day,
                                             slot_id=slot["id"], marked_by=self.staff_user[section["teacher"]],
                                             marked_at=self.dt(day, slot["end"].hour, slot["end"].minute))
                    for student in section["students"]:
                        roll = self.rng.random()
                        if (student["id"], day) in self.excused:
                            status = "excused"
                        elif student["id"] == noah["id"] and day in pattern_days:
                            status = "absent"
                        elif roll < student["reliability"]:
                            status = "late" if self.rng.random() < 0.04 else "present"
                        else:
                            status = "absent"
                        records.append({"session_id": session, "student_id": student["id"], "status": status,
                                        "created_at": self.dt(day, slot["end"].hour)})
                    if section["code"] == "CS-301" and self.attendance_sample is None and day < self.today - timedelta(days=3):
                        self.attendance_sample = session
            day += timedelta(days=1)
        await self.many("attendance_records", records)

    # ---------------------------------------------------------------- gradebook
    async def gradebook(self):
        published_codes = {"MTH-301", "BUS-302", "ENG-301", "PSY-301"}
        submitted_codes = {"CS-302"}
        self.marks_for_correction = None
        published_by_student: dict = {}
        for section in self.sections:
            categories = []
            for name, weight in [("Quizzes", 20), ("Assignments", 20), ("Midterm", 30), ("Final", 30)]:
                cid = await self.ins("assessment_categories", section_id=section["id"], name=name, weight=weight)
                categories.append({"id": cid, "name": name, "weight": weight})
            cat = {c["name"]: c["id"] for c in categories}
            plan = [("Quiz 1", "Quizzes", 20, self.add_school_days(self.term_start, 15)),
                    ("Assignment 1", "Assignments", 50, self.add_school_days(self.term_start, 25)),
                    ("Quiz 2", "Quizzes", 20, self.add_school_days(self.term_start, 35)),
                    ("Midterm Examination", "Midterm", 100, self.add_school_days(self.today, 12)),
                    ("Final Examination", "Final", 100, self.term_end - timedelta(days=10))]
            assessments = []
            for title, category, maximum, when in plan:
                aid = await self.ins("assessments", section_id=section["id"], category_id=cat[category], title=title,
                                     max_marks=maximum, assessment_date=when)
                assessments.append({"id": aid, "category_id": cat[category], "max_marks": maximum, "title": title, "date": when})
            section["assessments"] = assessments
            section["categories"] = categories
            rows = []
            student_marks: dict = {}
            for assessment in assessments:
                graded = assessment["date"] < self.today and not (section["code"] == "CS-301" and assessment["title"] == "Quiz 2")
                if not graded:
                    continue
                for student in section["students"]:
                    value = round(min(assessment["max_marks"], max(0, self.rng.gauss(student["ability"], 7) / 100 * assessment["max_marks"])), 1)
                    rows.append({"assessment_id": assessment["id"], "student_id": student["id"], "marks_obtained": value})
                    student_marks.setdefault(student["id"], {})[str(assessment["id"])] = value
            await self.many("marks", rows)
            status = "published" if section["code"] in published_codes else ("teacher_submitted" if section["code"] in submitted_codes else "draft")
            teacher_user = self.staff_user[section["teacher"]]
            await self.ins("grade_sheets", section_id=section["id"], status=status,
                           submitted_by=teacher_user if status != "draft" else None,
                           submitted_at=self.ago(days=6 if status == "published" else 1) if status != "draft" else None,
                           reviewed_by=self.staff_user["hopper"] if status == "published" else None,
                           reviewed_at=self.ago(days=5) if status == "published" else None,
                           published_by=self.staff_user["knuth"] if status == "published" else None,
                           published_at=self.ago(days=4) if status == "published" else None)
            if status == "published":
                for student in section["students"]:
                    percent = weighted_percent(categories, assessments, student_marks.get(student["id"], {}))
                    grade, points = letter_for(percent)
                    published_by_student.setdefault(student["id"], []).append({
                        "section_id": str(section["id"]), "code": section["code"], "title": section["title"],
                        "credits": section["credits"], "percent": percent, "grade": grade, "grade_points": points,
                        "teacher": self.staff_rows[section["teacher"]]["name"]})

        for student in self.students:
            if student["semester"] == 1:
                continue
            courses = []
            for code, title, credits in PREVIOUS_TERM_COURSES[student["programme"]]:
                percent = round(min(98, max(45, self.rng.gauss(student["ability"], 6))), 1)
                grade, points = letter_for(percent)
                courses.append({"code": code, "title": title, "credits": credits, "percent": percent, "grade": grade,
                                "grade_points": points, "teacher": "—"})
            gpa, credits = gpa_from_courses(courses)
            await self.ins("report_cards", student_id=student["id"], term_label=self.prev_term_label, version_no=1,
                           data={"term": self.prev_term_label, "courses": courses}, gpa=gpa, credits=credits,
                           published_at=self.dt(self.term_start - timedelta(days=40)))
            student["history"] = courses
        for student in self.students:
            courses = published_by_student.get(student["id"])
            if not courses:
                continue
            gpa, credits = gpa_from_courses(courses)
            await self.ins("report_cards", student_id=student["id"], term_label=self.term_label, term_id=self.term,
                           version_no=1, data={"term": self.term_label, "courses": courses}, gpa=gpa, credits=credits,
                           published_at=self.ago(days=4))
            student.setdefault("history", []).extend(courses)
        for student in self.students:
            cgpa, _ = gpa_from_courses(student.get("history", []))
            student["cgpa"] = cgpa
            if cgpa is not None:
                await self.conn.execute("UPDATE students SET cgpa = $1 WHERE id = $2", cgpa, student["id"])

    # ---------------------------------------------------------------- exams
    async def exams(self):
        teachers = [k for k, row in self.staff_rows.items() if row["role"] in ("teacher", "hod")]
        for index, section in enumerate(sorted(self.sections, key=lambda s: (s["programme"], s["code"]))):
            exam_day = self.add_school_days(self.today, 12 + (index % 5))
            exam = await self.ins("exam_schedules", section_id=section["id"], exam_type="midterm", exam_date=exam_day,
                                  start_time=time(10, 0) if index % 2 == 0 else time(14, 0), duration_minutes=120,
                                  room_id=self.rooms["EXH-001"])
            invigilator = next(t for t in teachers[index % len(teachers):] + teachers if t != section["teacher"])
            await self.ins("invigilator_duties", exam_schedule_id=exam, staff_id=self.staff[invigilator])

    # ---------------------------------------------------------------- fees
    async def fees(self):
        self.fee_heads = {}
        for code, name, category in [("TUI", "Tuition Fee", "academic"), ("LAB", "Lab & Library Fee", "academic"),
                                     ("EXM", "Examination Fee", "academic"), ("HST", "Hostel Fee", "residential"),
                                     ("TRN", "Transport Fee", "transport"), ("ADM", "Admission Fee", "admission"),
                                     ("LIB", "Library Fine", "fine"), ("MISC", "Miscellaneous", "other")]:
            self.fee_heads[code] = await self.ins("fee_heads", code=code, name=name, category=category)
        good, partial, defaulter = [], [], []
        for student in self.students:
            if student["name"] in ("Emma Watson", "Noah Johnson", "Olivia Williams"):
                profile = "good"
            elif student["name"] == "Liam Smith":
                profile = "defaulter"
            elif student["name"] == "William Brown":
                profile = "partial"
            else:
                r = self.rng.random()
                profile = "good" if r < 0.72 else ("partial" if r < 0.88 else "defaulter")
            student["pay_profile"] = profile
            {"good": good, "partial": partial, "defaulter": defaulter}[profile].append(student)

        due_t1 = self.term_start + timedelta(days=30)
        due_exam = self.add_school_days(self.today, 10)
        self.structure_items = {}
        for prog_code, _name, _short, _dept, _years, tuition in PROGRAMMES:
            structure = await self.ins("fee_structures", name=f"{self.programme_meta[prog_code]['name']} — {self.ay_name}",
                                       academic_year_id=self.ay, programme_id=self.programmes[prog_code], status="assigned",
                                       assigned_at=self.dt(self.term_start - timedelta(days=10)))
            items = {}
            for key, head, description, amount, due in [
                    ("tuition1", "TUI", f"Tuition Fee — {self.term_name}", tuition, due_t1),
                    ("lab", "LAB", "Lab & Library Fee", 350, due_t1),
                    ("exam", "EXM", f"Examination Fee — {self.term_name}", 450, due_exam),
                    ("tuition2", "TUI", "Tuition Fee — next term", tuition, self.next_term_start + timedelta(days=20))]:
                item_id = await self.ins("fee_structure_items", structure_id=structure, fee_head_id=self.fee_heads[head],
                                         description=description, amount=amount, due_date=due)
                items[key] = (item_id, head, description, amount, due)
            self.structure_items[prog_code] = items

        top = max((s for s in self.students if s["semester"] == 5 and s["programme"] == "BSC-CSAI"),
                  key=lambda s: s["ability"])
        concession = await self.ins("concessions", student_id=top["id"], fee_head_id=self.fee_heads["TUI"], kind="percent",
                                    value=10, reason="Merit scholarship — top of cohort", status="approved",
                                    requested_by=self.staff_user["raman"], created_at=self.ago(days=40))
        self.approved_concession = (concession, top)
        for student in self.students:
            if student["status_override"] if "status_override" in student else False:
                continue
            for key, (item_id, head, description, amount, due) in self.structure_items[student["programme"]].items():
                concession_amount = round(amount * 0.10, 2) if (student is top and key == "tuition1") else 0
                payable = amount - concession_amount
                profile = student["pay_profile"]
                if key in ("tuition1", "lab"):
                    paid = payable if profile == "good" or (profile == "partial" and key == "lab") else (
                        round(payable * 0.5, 2) if profile == "partial" else 0)
                elif key == "exam":
                    paid = payable if (profile == "good" and self.rng.random() < 0.25 and student is not self.emma) else 0
                else:
                    paid = 0
                invoice_id = await self.invoice(student, head, description, amount, due, paid=paid,
                                                structure_item_id=item_id, concession_amount=concession_amount)
                if student is top and key == "tuition1":
                    top_tuition_invoice = invoice_id
        await self.ins("invoice_adjustments", invoice_id=top_tuition_invoice, kind="concession",
                       amount=round(self.structure_items[top["programme"]]["tuition1"][3] * 0.10, 2),
                       reason="Merit scholarship — top of cohort (10%)", before={"concession_amount": 0},
                       after={"concession_amount": round(self.structure_items[top["programme"]]["tuition1"][3] * 0.10, 2)},
                       actor_user_id=self.staff_user["principal"], created_at=self.ago(days=39))
        self.pending_concession_student = next(s for s in self.students if s["semester"] == 5 and s["programme"] == "BENG-RAS")

    async def invoice(self, student, head, description, amount, due, *, paid=0.0, structure_item_id=None,
                      concession_amount=0.0, origin="fees", method=None):
        if not hasattr(self, "last_invoice_for"):
            self.last_invoice_for = {}
        payable = round(amount - concession_amount, 2)
        if paid >= payable and payable > 0:
            status = "paid"
        elif due < self.today:
            status = "overdue"
        elif paid > 0:
            status = "partially_paid"
        else:
            status = "generated"
        invoice_id = await self.ins("invoices", invoice_no=self.code("invoice", "INV-", 6), student_id=student["id"],
                                    structure_item_id=structure_item_id, fee_head_id=self.fee_heads[head],
                                    description=description, amount=amount, concession_amount=concession_amount,
                                    paid_amount=paid, due_date=due, status=status, origin_module=origin,
                                    created_at=self.dt(min(due, self.today) - timedelta(days=25)))
        self.last_invoice_for[(student["id"], head)] = invoice_id
        if paid > 0:
            paid_on = min(self.today - timedelta(days=1), due - timedelta(days=self.rng.randint(1, 12)))
            online = self.rng.random() < 0.45
            payment = await self.ins("payments", payment_no=self.code("payment", "PAY-", 6), invoice_id=invoice_id,
                                     student_id=student["id"], amount=paid,
                                     method=method or ("online_gateway" if online else self.rng.choice(["bank_transfer", "card", "cash", "upi"])),
                                     gateway="sandbox" if online else None,
                                     gateway_ref=f"SBX-{self.rng.randint(10**9, 10**10 - 1)}" if online else None,
                                     status="success", paid_at=self.dt(paid_on, self.rng.randint(9, 17)),
                                     recorded_by_user_id=None if online else self.staff_user["raman"],
                                     payer_user_id=student["guardian_user"] if online else None,
                                     reference=None if online else f"TXN{self.rng.randint(100000, 999999)}",
                                     created_at=self.dt(paid_on, 9))
            await self.ins("receipts", receipt_no=self.code("receipt", "RCT-", 6), payment_id=payment,
                           issued_at=self.dt(paid_on, 18))
        return invoice_id

    # ---------------------------------------------------------------- admissions
    async def admissions(self):
        stages = ["new"] * 6 + ["contacted"] * 6 + ["applied"] * 7 + ["lost"] * 3
        programmes = list(self.programmes)
        enquiries = []
        for i, stage in enumerate(stages):
            gender = "F" if i % 2 else "M"
            name = self.unique_name(gender)
            first, last = name.split(" ", 1)
            enquiry = await self.ins(
                "enquiries", enquiry_no=self.code("enquiry", "ENQ-"), name=name,
                email=f"{first.lower()}.{last.lower()}{i}@applicant.example.com",
                phone=f"+1 555 4{self.rng.randint(10, 99)} {self.rng.randint(1000, 9999)}",
                source_channel=self.rng.choice(["web", "walk_in", "call", "campaign", "referral"]),
                programme_id=self.programmes[programmes[i % 4]], counsellor_user_id=self.staff_user["brooks"] if stage != "new" or i % 3 else None,
                stage=stage, lost_reason="Chose another institution" if stage == "lost" else None,
                last_contacted_at=self.ago(days=self.rng.randint(1, 10)) if stage != "new" else None,
                notes="Interested in scholarships" if i % 4 == 0 else None, created_at=self.ago(days=self.rng.randint(2, 30)))
            enquiries.append((enquiry, name, programmes[i % 4], stage))
        applied = [e for e in enquiries if e[3] == "applied"]
        statuses = ["submitted", "submitted", "under_review", "under_review", "documents_verified", "documents_verified",
                    "shortlisted", "offer_pending", "offered", "accepted"]
        for index, status in enumerate(statuses):
            if index < len(applied):
                enquiry_id, name, prog_code, _stage = applied[index]
            else:
                enquiry_id, name, prog_code = None, self.unique_name("F" if index % 2 else "M"), programmes[index % 4]
            first, last = name.split(" ", 1)
            guardian = f"{self.rng.choice(PARENT_M)} {last}"
            app = await self.ins(
                "applications", application_no=self.code("application", "APP-"), enquiry_id=enquiry_id,
                applicant_name=name, email=f"{first.lower()}.{last.lower()}@applicant.example.com",
                phone=f"+1 555 6{self.rng.randint(10, 99)} {self.rng.randint(1000, 9999)}",
                dob=date(self.today.year - 18, self.rng.randint(1, 12), self.rng.randint(1, 28)),
                gender="F" if index % 2 else "M", programme_id=self.programmes[prog_code], guardian_name=guardian,
                guardian_email=f"{guardian.split()[0].lower()}.{last.lower()}@mail.example.com",
                guardian_phone=f"+1 555 7{self.rng.randint(10, 99)} {self.rng.randint(1000, 9999)}",
                prior_score=round(self.rng.uniform(62, 97), 1), status=status,
                merit_rank=index + 1 if status in ("shortlisted", "offer_pending", "offered", "accepted") else None,
                offer_issued_at=self.ago(days=3) if status in ("offered", "accepted") else None,
                accepted_at=self.ago(days=1) if status == "accepted" else None, created_at=self.ago(days=12 - index))
            for doc_type in ["previous_marksheet", "id_proof", "photograph"]:
                doc_status = "verified" if status not in ("submitted", "under_review") else (
                    "verified" if status == "under_review" and doc_type == "photograph" else "pending")
                await self.ins("application_documents", application_id=app, doc_type=doc_type, status=doc_status,
                               verified_by=self.staff_user["brooks"] if doc_status == "verified" else None,
                               verified_at=self.ago(days=4) if doc_status == "verified" else None)
            if status == "offer_pending":
                self.offer_pending_application = (app, name)
            if status == "accepted":
                applicant = await self.ins("students", name=name, email=f"{first.lower()}.{last.lower()}@applicant.example.com",
                                           programme_id=self.programmes[prog_code], cohort=int(self.ay_name[:4]),
                                           current_semester=1, status="applicant", gender="F" if index % 2 else "M")
                gid = await self.ins("guardians", name=guardian, email=f"{guardian.split()[0].lower()}.{last.lower()}@mail.example.com")
                await self.ins("guardian_student_links", guardian_id=gid, student_id=applicant, relationship="Father",
                               is_emergency_contact=True)
                await self.conn.execute("UPDATE applications SET student_id = $1 WHERE id = $2", applicant, app)
                await self.ins("invoices", invoice_no=self.code("invoice", "INV-", 6), student_id=applicant,
                               fee_head_id=self.fee_heads["ADM"], description="Admission Fee", amount=1500,
                               due_date=self.today + timedelta(days=7), status="generated", origin_module="admissions")

    # ---------------------------------------------------------------- communication
    async def communication(self):
        cs301 = self.section_by_code["CS-301"]
        announcements = [
            ("Midterm examination schedule published", "The Term midterm timetable is now available under Examinations. "
             "Hall tickets are generated automatically for eligible students.", "circular",
             {"roles": ["student", "parent", "teacher", "hod"]}, "knuth", 2),
            ("Library extended hours during midterms", "The library will stay open until 11 pm on weekdays for the next three weeks.",
             "announcement", {"roles": ["student", "teacher", "hod"]}, "castillo", 3),
            ("CS-301: Friday session moves to Computing Lab 201", "This week's Friday session is a hands-on graph algorithms lab in LAB-201.",
             "announcement", {"section_ids": [str(cs301["id"])]}, "turing", 1),
            ("Reminder: examination fee due soon", "Please clear the Term examination fee before the due date to receive hall tickets on time.",
             "announcement", {"roles": ["parent", "student"]}, "raman", 1),
            ("Placement drive: Northwind Analytics internships", "Applications for the Data Science internship close soon. Check the Placement Hub.",
             "announcement", {"roles": ["student"], "programme_ids": [str(self.programmes["BSC-CSAI"]), str(self.programmes["BSC-PSY"])]}, "vance", 0),
        ]
        for title, body, kind, audience, author, days in announcements:
            roles = audience.get("roles")
            count = await self.conn.fetchval("SELECT count(*) FROM users WHERE role_key = ANY($1::text[])", roles) if roles else len(cs301["students"]) * 2
            await self.ins("announcements", title=title, body=body, kind=kind, audience=audience, status="published",
                           published_at=self.ago(days=days, hours=2), published_by=self.staff_user[author],
                           author_user_id=self.staff_user[author], recipients_count=count, created_at=self.ago(days=days, hours=3))
        await self.ins("announcements", title="Annual sports meet — volunteers needed", body="Draft: call for staff and student volunteers.",
                       kind="announcement", audience={"roles": ["student", "teacher"]}, status="draft",
                       author_user_id=self.staff_user["principal"])
        slot_day = self.add_school_days(self.today, 3)
        liam = self.student_by_name["Liam Smith"]
        for teacher, count in [("turing", 6), ("hopper", 4)]:
            for i in range(count):
                start = self.dt(slot_day, 14) + timedelta(minutes=15 * i)
                booked = teacher == "turing" and i == 1
                await self.ins("ptm_slots", staff_id=self.staff[teacher], starts_at=start, ends_at=start + timedelta(minutes=15),
                               location="Faculty Room 2" if teacher == "turing" else "HOD Office", status="booked" if booked else "open",
                               guardian_user_id=liam["guardian_user"] if booked else None,
                               student_id=liam["id"] if booked else None, booked_at=self.ago(hours=6) if booked else None)
        thread = await self.ins("chat_threads", subject="Emma — CS-301 project deadline", student_id=self.emma["id"],
                                created_by_user_id=self.emma["guardian_user"], last_message_at=self.ago(hours=5))
        for uid in (self.emma["guardian_user"], self.staff_user["turing"]):
            await self.ins("chat_participants", thread_id=thread, user_id=uid)
        for sender, body, hours in [(self.emma["guardian_user"], "Hello Dr. Turing, Emma mentioned the project deadline moved. Could you confirm the new date?", 7),
                                    (self.staff_user["turing"], "Hello Mr. Watson — yes, it is now due at the end of next week. Emma is well on track.", 6),
                                    (self.emma["guardian_user"], "Thank you, that's helpful!", 5)]:
            await self.ins("chat_messages", thread_id=thread, sender_user_id=sender, body=body, created_at=self.ago(hours=hours))

    # ---------------------------------------------------------------- HR & payroll
    async def hr_payroll(self):
        year = self.today.year
        rows = []
        for key in self.staff:
            for leave_type, allotted in [("casual", 12), ("sick", 10), ("earned", 15)]:
                rows.append({"staff_id": self.staff[key], "leave_type": leave_type, "year": year, "allotted": allotted,
                             "used": self.rng.randint(0, 4)})
        await self.many("staff_leave_balances", rows)
        start = self.add_school_days(self.today, 5)
        self.hamilton_leave = await self.ins("staff_leave_requests", request_no=self.code("staff_leave", "SLV-"),
                                             staff_id=self.staff["hamilton"], leave_type="casual", start_date=start,
                                             end_date=self.add_school_days(start, 1), days=2,
                                             reason="Speaking at a software engineering conference", status="pending",
                                             created_at=self.ago(hours=10))
        past = self.add_school_days(self.today, -7)
        self.watanabe_leave = await self.ins("staff_leave_requests", request_no=self.code("staff_leave", "SLV-"),
                                             staff_id=self.staff["watanabe"], leave_type="sick", start_date=past,
                                             end_date=past, days=1, reason="Flu", status="approved",
                                             decided_by=self.staff_user["moreno"], decided_at=self.dt(past, 8),
                                             comment="Approved — rest well", created_at=self.dt(past, 7))
        await self.ins("staff_leave_requests", request_no=self.code("staff_leave", "SLV-"), staff_id=self.staff["reyes"],
                       leave_type="earned", start_date=self.add_school_days(self.today, -15),
                       end_date=self.add_school_days(self.today, -13), days=3, reason="Personal travel", status="rejected",
                       decided_by=self.staff_user["johnson"], decided_at=self.ago(days=20),
                       comment="Overlaps with Statistics lab assessments", created_at=self.ago(days=21))

        first_of_month = self.today.replace(day=1)
        prev_month_end = first_of_month - timedelta(days=1)
        period = prev_month_end.strftime("%Y-%m")
        grades = {"G1": (20, 10, 12, 20), "G2": (18, 10, 12, 15), "G3": (15, 8, 12, 10), "G4": (10, 6, 12, 5)}
        run = await self.ins("payroll_runs", run_no=self.code("payroll_run", "PR-", 4), period=period, status="disbursed",
                             calculated_at=self.dt(prev_month_end - timedelta(days=3)),
                             locked_at=self.dt(prev_month_end - timedelta(days=2)), disbursed_at=self.dt(prev_month_end))
        working_days = sum(1 for i in range(prev_month_end.day) if date(prev_month_end.year, prev_month_end.month, i + 1).isoweekday() <= 5)
        total_gross = total_net = 0.0
        for key, row in self.staff_rows.items():
            hra, da, pf, tax = grades[row["grade"]]
            basic = round(row["salary"] / 12, 2)
            lop = 1 if key == "reyes" else 0
            lop_deduction = round(basic / working_days * lop, 2)
            allowances = {"hra": round(basic * hra / 100, 2), "da": round(basic * da / 100, 2)}
            gross = round(basic + sum(allowances.values()) - lop_deduction, 2)
            deductions = {"pf": round(basic * pf / 100, 2), "tax": round(gross * tax / 100, 2), "lop": lop_deduction}
            net = round(gross - deductions["pf"] - deductions["tax"], 2)
            total_gross += gross
            total_net += net
            await self.ins("payslips", run_id=run, staff_id=self.staff[key], basic=basic, allowances=allowances,
                           deductions=deductions, gross=gross, net=net, lop_days=lop, working_days=working_days)
        await self.conn.execute("UPDATE payroll_runs SET total_gross = $1, total_net = $2, staff_count = $3 WHERE id = $4",
                                round(total_gross, 2), round(total_net, 2), len(self.staff_rows), run)

    # ---------------------------------------------------------------- library
    async def library(self):
        items = []
        for title, author, publisher, category, year, copies in LIBRARY_BOOKS:
            item_id = await self.ins("library_items", accession_no=self.code("accession", "ACC-"), title=title, author=author,
                                     publisher=publisher, category=category, published_year=year, copies_total=copies,
                                     copies_available=copies, isbn=f"978{self.rng.randint(10**9, 10**10 - 1)}",
                                     shelf=f"{category[:3].upper()}-{self.rng.randint(1, 20):02d}")
            items.append({"id": item_id, "title": title, "copies": copies, "issued": 0})
        by_title = {i["title"]: i for i in items}
        emma = self.emma
        liam = self.student_by_name["Liam Smith"]
        loans = [
            (emma, "Introduction to Algorithms", "issued", -9, 5, None),
            (emma, "Clean Code", "returned", -40, -26, -27),
            (liam, "Database System Concepts", "issued", -20, -6, None),
            (liam, "Discrete Mathematics and Its Applications", "returned", -48, -34, -8),
        ]
        others = [s for s in self.students if s not in (emma, liam)]
        for i, title in enumerate(["Designing Data-Intensive Applications", "Artificial Intelligence: A Modern Approach",
                                   "Marketing Management", "Modern Control Engineering", "Cognitive Psychology",
                                   "Thinking, Fast and Slow", "The Lean Startup", "Probabilistic Robotics"]):
            status_offset = [(-5, 9, None), (-18, -4, None), (-10, 4, None), (-22, -8, None), (-3, 11, None),
                             (-30, -16, -18), (-25, -11, -12), (-7, 7, None)][i]
            loans.append((others[i * 3], title, "returned" if status_offset[2] else "issued", *status_offset))
        for i, title in enumerate(["Linear Algebra Done Right", "Research Design"]):
            loans.append((others[i * 5 + 1], title, "requested", 0, None, None))
        for student, title, status, issued_off, due_off, returned_off in loans:
            item = by_title[title]
            issued_at = self.dt(self.today + timedelta(days=issued_off), 11) if status != "requested" else None
            due = self.today + timedelta(days=due_off) if due_off is not None else None
            returned_at = self.dt(self.today + timedelta(days=returned_off), 15) if returned_off is not None else None
            fine = 0
            fine_status = "none"
            fine_invoice = None
            if status == "returned" and returned_at and due and returned_at.date() > due:
                fine = float((returned_at.date() - due).days)
                fine_status = "invoiced"
                fine_invoice = await self.invoice(student, "LIB", f"Library fine — {title}", fine,
                                                  self.today + timedelta(days=7), origin="library")
            loan = await self.ins("library_loans", loan_no=self.code("loan", "LN-"), item_id=item["id"],
                                  borrower_user_id=student["user"], student_id=student["id"], status=status,
                                  requested_at=issued_at or self.ago(hours=8), issued_at=issued_at, due_date=due,
                                  returned_at=returned_at, fine_amount=fine, fine_status=fine_status,
                                  fine_invoice_id=fine_invoice, issued_by=self.staff_user["castillo"] if issued_at else None,
                                  created_at=issued_at or self.ago(hours=8))
            if status == "issued":
                item["issued"] += 1
            if student is liam and status == "returned":
                self.liam_fine_loan = (loan, fine, fine_invoice)
        turing_item = by_title["Pattern Recognition and Machine Learning"]
        await self.ins("library_loans", loan_no=self.code("loan", "LN-"), item_id=turing_item["id"],
                       borrower_user_id=self.staff_user["turing"], status="issued", requested_at=self.ago(days=6),
                       issued_at=self.ago(days=6), due_date=self.today + timedelta(days=8), issued_by=self.staff_user["castillo"])
        turing_item["issued"] += 1
        robotics = by_title["Probabilistic Robotics"]
        await self.ins("library_reservations", item_id=robotics["id"], user_id=others[2]["user"], status="waiting")
        for item in items:
            await self.conn.execute("UPDATE library_items SET copies_available = $1 WHERE id = $2",
                                    max(0, item["copies"] - item["issued"]), item["id"])

    # ---------------------------------------------------------------- placement
    async def placement(self):
        companies = {}
        for name, industry, status in [("Northwind Analytics", "Data & Analytics", "approved"),
                                       ("Contoso Cloud", "Cloud Infrastructure", "approved"),
                                       ("Fabrikam Robotics", "Industrial Robotics", "approved"),
                                       ("Litware AI Labs", "Artificial Intelligence", "approved"),
                                       ("Adventure Works Consulting", "Management Consulting", "approved"),
                                       ("Tailspin Aerospace", "Aerospace", "pending")]:
            companies[name] = await self.ins("companies", name=name, industry=industry, mou_status=status,
                                             website=f"https://{name.split()[0].lower()}.example.com",
                                             contact_name="Talent Partner", contact_email=f"campus@{name.split()[0].lower()}.example.com",
                                             mou_valid_until=self.today + timedelta(days=365) if status == "approved" else None)
        p = self.programmes
        postings = [
            ("Northwind Analytics", "Data Science Intern", "internship", 3000, "$3,000 / month", 3.2, [p["BSC-CSAI"], p["BSC-PSY"]], 3, 12, 20, "open"),
            ("Contoso Cloud", "Cloud Engineering Intern", "internship", 2800, "$2,800 / month", 3.0, [p["BSC-CSAI"], p["BENG-RAS"]], 3, 6, 14, "open"),
            ("Fabrikam Robotics", "Graduate Robotics Engineer", "job", 92000, "$92,000 / year", 3.0, [p["BENG-RAS"]], 5, 18, 28, "open"),
            ("Litware AI Labs", "Associate ML Engineer", "job", 105000, "$105,000 / year", 3.4, [p["BSC-CSAI"]], 5, 3, 10, "open"),
            ("Adventure Works Consulting", "Business Analyst", "job", 78000, "$78,000 / year", 2.8, [p["BBA-DB"], p["BSC-PSY"]], 5, 15, 24, "open"),
            ("Litware AI Labs", "Summer Research Intern", "internship", 2500, "$2,500 / month", 3.3, [p["BSC-CSAI"]], 3, -60, -50, "closed"),
        ]
        posting_ids = []
        for company, title, kind, ctc, ctc_text, min_cgpa, programmes, min_sem, deadline, drive, status in postings:
            pid = await self.ins("job_postings", posting_no=self.code("posting", "JOB-", 4), company_id=companies[company],
                                 title=title, kind=kind, ctc=ctc, ctc_text=ctc_text, location="Hybrid — Springfield",
                                 min_cgpa=min_cgpa, eligible_programme_ids=[str(x) for x in programmes], min_semester=min_sem,
                                 openings=self.rng.randint(3, 10), deadline=self.today + timedelta(days=deadline),
                                 drive_date=self.today + timedelta(days=drive), status=status,
                                 description=f"{company} is hiring a {title}. Strong fundamentals and communication skills required.")
            posting_ids.append(pid)
        northwind, contoso, fabrikam, litware, adventure, _closed = posting_ids
        await self.ins("drive_rounds", posting_id=northwind, round_no=1, name="Online assessment", status="completed",
                       scheduled_at=self.ago(days=2))
        await self.ins("drive_rounds", posting_id=northwind, round_no=2, name="Technical interview",
                       scheduled_at=self.dt(self.today + timedelta(days=20), 10))
        await self.ins("drive_rounds", posting_id=litware, round_no=1, name="Aptitude test", status="completed", scheduled_at=self.ago(days=6))
        await self.ins("drive_rounds", posting_id=litware, round_no=2, name="Panel interview", status="completed", scheduled_at=self.ago(days=3))

        async def apply(posting, student, stage, current_round=0, offer=None):
            app = await self.ins("placement_applications", posting_id=posting, student_id=student["id"], stage=stage,
                                 current_round=current_round, created_at=self.ago(days=self.rng.randint(2, 9)))
            if offer:
                await self.ins("offers", application_id=app, ctc=offer[0], status=offer[1],
                               joining_date=self.today + timedelta(days=270), offered_at=self.ago(days=2),
                               responded_at=self.ago(days=1) if offer[1] != "offered" else None)
            return app

        await apply(northwind, self.emma, "shortlisted", 1)
        await apply(contoso, self.emma, "applied")
        cs3 = [s for s in self.students if s["programme"] == "BSC-CSAI" and s["semester"] == 3 and s is not self.emma]
        for s in cs3[2:4]:
            await apply(northwind, s, "applied")
        cs5 = [s for s in self.students if s["programme"] == "BSC-CSAI" and s["semester"] == 5]
        for i, s in enumerate(cs5[:5]):
            stage, rnd, offer = [("accepted", 2, (105000, "accepted")), ("offered", 2, (105000, "offered")),
                                 ("in_rounds", 2, None), ("rejected", 1, None), ("applied", 0, None)][i]
            await apply(litware, s, stage, rnd, offer)
        for s in [x for x in self.students if x["programme"] == "BENG-RAS" and x["semester"] == 5][:3]:
            await apply(fabrikam, s, "applied")
        for s in [x for x in self.students if x["programme"] == "BBA-DB" and x["semester"] == 5][:2]:
            await apply(adventure, s, "shortlisted")

    # ---------------------------------------------------------------- hostel
    async def hostel(self):
        blocks = {}
        for name, gender in [("Aurora Hall", "F"), ("Summit Hall", "M")]:
            blocks[gender] = await self.ins("hostel_blocks", name=name, gender=gender, warden_staff_id=self.staff["menon"])
        rooms = {"F": [], "M": []}
        for gender, block in blocks.items():
            for n in range(1, 9):
                room = await self.ins("hostel_rooms", block_id=block, room_no=f"{100 + n}", capacity=2,
                                      room_type="double", status="maintenance" if (gender == "M" and n == 8) else "active")
                rooms[gender].append({"id": room, "no": f"{100 + n}", "beds": 0, "maintenance": gender == "M" and n == 8})
        excluded = {"Emma Watson", "Liam Smith"}
        residents = {"F": [s for s in self.students if s["gender"] == "F" and s["name"] not in excluded][:12],
                     "M": [s for s in self.students if s["gender"] == "M" and s["name"] not in excluded][:12]}
        self.hostel_residents = []
        for gender, students in residents.items():
            available = [r for r in rooms[gender] if not r["maintenance"]]
            for i, student in enumerate(students):
                room = available[i // 2]
                room["beds"] += 1
                await self.ins("room_allotments", room_id=room["id"], student_id=student["id"], bed_no=room["beds"],
                               from_date=self.term_start, status="active")
                student["hostel_room"] = room
                self.hostel_residents.append(student)
                await self.invoice(student, "HST", f"Hostel Fee — {self.term_name}", 1200,
                                   self.term_start + timedelta(days=30),
                                   paid=1200 if student["pay_profile"] != "defaulter" else 0, origin="hostel")
        for i, student in enumerate(self.hostel_residents[:6]):
            out_at = self.ago(days=i % 3, hours=6)
            await self.ins("hostel_movements", student_id=student["id"], direction="out", moved_at=out_at, reason="Town visit",
                           expected_return_at=out_at + timedelta(hours=4), logged_by=self.staff_user["menon"])
            late = i == 2
            await self.ins("hostel_movements", student_id=student["id"], direction="in",
                           moved_at=out_at + timedelta(hours=5 if late else 3), late=late, logged_by=self.staff_user["menon"])
        complaints = [("Internet", "Wi-Fi keeps disconnecting in the evening", "open"),
                      ("Plumbing", "Leaking tap in the shared bathroom", "in_progress"),
                      ("Furniture", "Broken study chair", "resolved")]
        for (category, description, status), student in zip(complaints, self.hostel_residents[1::5]):
            await self.ins("hostel_complaints", student_id=student["id"], room_id=student["hostel_room"]["id"], category=category,
                           description=description, status=status, resolved_at=self.ago(days=1) if status == "resolved" else None,
                           resolution="Chair replaced" if status == "resolved" else None, created_at=self.ago(days=4))
        self.hostel_request_student = self.hostel_residents[3]

    # ---------------------------------------------------------------- transport
    async def transport(self):
        vehicles = []
        for i, (reg, model, driver) in enumerate([("NC-BUS-01", "Volvo 9700 (45 seats)", "Joe Martinez"),
                                                  ("NC-BUS-02", "Mercedes Tourismo (40 seats)", "Anita Kapoor"),
                                                  ("NC-BUS-03", "Blue Bird Vision (48 seats)", "Samuel Green")]):
            vehicles.append(await self.ins("vehicles", reg_no=reg, model=model, capacity=45, driver_name=driver,
                                           driver_phone=f"+1 555 88{i} {self.rng.randint(1000, 9999)}",
                                           permit_expiry=self.today + timedelta(days=200 + i * 30),
                                           insurance_expiry=self.today + timedelta(days=20 if i == 0 else 180),
                                           fitness_expiry=self.today + timedelta(days=150)))
        base = [(40.7128, -74.0060), (40.7282, -73.9942), (40.7484, -73.9857)]
        self.routes = []
        for i, (code, name) in enumerate([("R1", "North Springfield Loop"), ("R2", "Riverside Express"), ("R3", "Hillcrest Line")]):
            route = await self.ins("routes", code=code, name=name, vehicle_id=vehicles[i])
            stops = []
            for seq, stop_name in enumerate(["Central Library Stop", "Maple Avenue", "Riverside Park", "Main Gate"][:4], start=1):
                lat, lng = base[i]
                stop = await self.ins("route_stops", route_id=route, seq=seq, name=f"{stop_name}" if seq == 4 else f"{name.split()[0]} — {stop_name}",
                                      pickup_time=time(7, 10 + seq * 8), lat=round(lat + seq * 0.004, 6), lng=round(lng + seq * 0.003, 6))
                stops.append(stop)
            self.routes.append({"id": route, "stops": stops, "code": code})
        hostel_ids = {s["id"] for s in self.hostel_residents}
        day_scholars = [s for s in self.students if s["id"] not in hostel_ids]
        riders = [self.emma] + [s for s in day_scholars if s is not self.emma][:17]
        self.transport_riders = riders
        for i, student in enumerate(riders):
            route = self.routes[0] if student is self.emma else self.routes[i % 3]
            stop = route["stops"][1] if student is self.emma else route["stops"][i % 3]
            await self.ins("transport_allocations", student_id=student["id"], route_id=route["id"], stop_id=stop,
                           from_date=self.term_start)
            student["route"] = route
            await self.invoice(student, "TRN", f"Transport Fee — {self.term_name}", 400, self.term_start + timedelta(days=30),
                               paid=400 if student["pay_profile"] == "good" else 0, origin="transport")
        yesterday = self.add_school_days(self.today, -1)
        for route in self.routes:
            for direction, hour in [("pickup", 7), ("drop", 16)]:
                await self.ins("trips", route_id=route["id"], trip_date=yesterday, direction=direction, status="completed",
                               started_at=self.dt(yesterday, hour), ended_at=self.dt(yesterday, hour, 55), current_stop_seq=4,
                               delay_minutes=12 if (route["code"] == "R2" and direction == "pickup") else 0,
                               started_by=self.staff_user["alvarez"])
        await self.ins("transport_incidents", route_id=self.routes[1]["id"], kind="delay", severity="WARNING",
                       description="Road works on Riverside Drive caused a 12 minute delay", status="resolved",
                       reported_by_user_id=self.staff_user["alvarez"], resolved_at=self.ago(days=1), resolution="Detour via 5th Street")

    # ---------------------------------------------------------------- cafeteria & wallets
    async def cafeteria(self):
        menu = []
        for name, category, price, veg, allergens, calories in [
                ("Veg Wrap", "Mains", 4.50, True, ["gluten"], 420), ("Chicken Rice Bowl", "Mains", 6.75, False, [], 610),
                ("Masala Dosa", "Mains", 3.50, True, [], 380), ("Caesar Salad", "Salads", 5.25, False, ["egg", "dairy"], 350),
                ("Margherita Slice", "Snacks", 3.00, True, ["gluten", "dairy"], 290), ("Fruit Cup", "Snacks", 2.25, True, [], 120),
                ("Cold Brew Coffee", "Beverages", 2.75, True, [], 15), ("Masala Chai", "Beverages", 1.25, True, ["dairy"], 90),
                ("Protein Smoothie", "Beverages", 3.95, True, ["dairy", "nuts"], 310), ("Veg Biryani", "Mains", 5.50, True, [], 560),
                ("Paneer Tikka Wrap", "Mains", 4.95, True, ["dairy", "gluten"], 480), ("Chocolate Brownie", "Desserts", 1.95, True, ["gluten", "egg"], 330),
                ("Bottled Water", "Beverages", 1.00, True, [], 0), ("Club Sandwich", "Snacks", 4.25, False, ["gluten", "egg"], 450)]:
            item = await self.ins("menu_items", name=name, category=category, price=price, is_veg=veg, allergens=allergens, calories=calories)
            menu.append({"id": item, "name": name, "price": price})
        txns, orders = [], []
        for student in self.students:
            wallet = await self.ins("wallets", student_id=student["id"], card_no=f"NC{self.rng.randint(10**7, 10**8 - 1)}",
                                    daily_limit=30 if student is self.emma else 40, balance=0)
            balance = 0.0
            for day_offset in range(12, 0, -1):
                day = self.today - timedelta(days=day_offset)
                if day_offset in (12, 6) or balance < 8:
                    amount = float(self.rng.choice([50, 75, 100]))
                    balance = round(balance + amount, 2)
                    online = self.rng.random() < 0.6
                    txns.append({"txn_no": self.code("wallet_txn", "WT-", 6), "wallet_id": wallet, "kind": "topup",
                                 "amount": amount, "balance_after": balance, "channel": "sandbox_gateway" if online else "cash_counter",
                                 "reference": f"SBX-{self.rng.randint(10**8, 10**9 - 1)}" if online else None,
                                 "actor_user_id": student["guardian_user"] if online else self.staff_user["farouk"],
                                 "created_at": self.dt(day, 8), "flagged": False})
                if day.isoweekday() > 5 or self.rng.random() < 0.35:
                    continue
                picks = self.rng.sample(menu, self.rng.randint(1, 2))
                total = round(sum(p["price"] for p in picks), 2)
                if total > balance:
                    continue
                balance = round(balance - total, 2)
                txn_no = self.code("wallet_txn", "WT-", 6)
                txns.append({"txn_no": txn_no, "wallet_id": wallet, "kind": "spend", "amount": total, "balance_after": balance,
                             "channel": "pos", "reference": None, "actor_user_id": self.staff_user["farouk"],
                             "created_at": self.dt(day, 12, self.rng.randint(0, 59)), "flagged": False})
                orders.append({"order_no": self.code("pos_order", "POS-", 6), "student_id": student["id"],
                               "items": [{"menu_item_id": str(p["id"]), "name": p["name"], "qty": 1, "price": p["price"]} for p in picks],
                               "total": total, "payment_method": "wallet", "status": "completed",
                               "cashier_user_id": self.staff_user["farouk"], "created_at": self.dt(day, 12, 30)})
            await self.conn.execute("UPDATE wallets SET balance = $1 WHERE id = $2", balance, wallet)
        await self.many("wallet_transactions", txns)
        await self.many("pos_orders", orders)

    # ---------------------------------------------------------------- inventory
    async def inventory(self):
        items = {}
        for sku, name, category, uom, stock, reorder, cost in [
                ("STN-A4", "A4 Paper Ream", "Stationery", "ream", 32, 50, 4.5), ("STN-MRK", "Whiteboard Markers (pack of 4)", "Stationery", "pack", 60, 30, 6.0),
                ("LAB-GLV", "Nitrile Lab Gloves (box)", "Lab Supplies", "box", 18, 20, 9.5), ("IT-ETH", "Cat6 Ethernet Cable 5m", "IT", "unit", 45, 15, 7.0),
                ("ELC-ARD", "Arduino Uno Starter Kit", "Electronics", "kit", 14, 10, 38.0), ("IT-LMP", "Projector Lamp", "IT", "unit", 1, 2, 120.0),
                ("IT-TNR", "Laser Printer Toner", "IT", "unit", 9, 6, 65.0), ("FAC-CLN", "Cleaning Supplies Kit", "Facilities", "kit", 25, 10, 22.0),
                ("STN-NBK", "Ruled Notebook", "Stationery", "unit", 300, 100, 1.2), ("IT-USB", "USB-C Charger 65W", "IT", "unit", 12, 5, 29.0),
                ("LAB-GOG", "Safety Goggles", "Lab Supplies", "unit", 40, 20, 5.5), ("ELC-SLD", "Soldering Station", "Electronics", "unit", 6, 4, 85.0),
                ("LAB-BKR", "Glass Beaker 250ml", "Lab Supplies", "unit", 70, 30, 3.8), ("FAC-BLB", "LED Tube Light", "Facilities", "unit", 22, 25, 8.0)]:
            items[sku] = await self.ins("inventory_items", sku=sku, name=name, category=category, uom=uom, stock_qty=stock,
                                        reorder_level=reorder, unit_cost=cost)
            await self.ins("stock_movements", item_id=items[sku], kind="grn", qty=stock + 10, reference="Opening stock",
                           actor_user_id=self.staff_user["becker"], created_at=self.ago(days=60))
            await self.ins("stock_movements", item_id=items[sku], kind="issue", qty=10, reference="Term start issue",
                           actor_user_id=self.staff_user["becker"], created_at=self.ago(days=40))
        assets = {}
        for tag, name, category, location, cost, life, years_old, status, warranty_days in [
                ("AST-0001", "Dell Latitude 7440 Laptop", "IT", "Computing Lab 201", 1450, 4, 1, "in_use", 400),
                ("AST-0002", "Epson EB-L630U Projector", "AV", "Lecture Hall 101", 2600, 6, 2, "in_use", 30),
                ("AST-0003", "Prusa MK4 3D Printer", "Lab", "Robotics Lab 202", 1100, 5, 1, "under_maintenance", 200),
                ("AST-0004", "Rack Server PowerEdge R760", "IT", "Server Room", 8900, 6, 1, "in_use", 700),
                ("AST-0005", "UR5e Collaborative Robot Arm", "Lab", "Robotics Lab 202", 32000, 8, 2, "in_use", 300),
                ("AST-0006", "Daikin Split AC 2T", "Facilities", "Library Reading Room", 1800, 8, 5, "in_use", 20),
                ("AST-0007", "EEG Research Headset", "Lab", "Psychology Lab 203", 5400, 5, 3, "in_use", -30),
                ("AST-0008", "Canon imageRUNNER Copier", "Office", "Admin Block", 4200, 7, 6, "in_use", -400),
                ("AST-0009", "Interactive Smart Board", "AV", "Seminar Room 301", 3100, 6, 1, "in_use", 500),
                ("AST-0010", "Oscilloscope Keysight 1000X", "Lab", "Electronics Lab 204", 1350, 8, 4, "in_store", 100)]:
            assets[tag] = await self.ins("assets", asset_tag=tag, name=name, category=category, location=location,
                                         purchase_date=self.today - timedelta(days=365 * years_old), cost=cost,
                                         salvage_value=round(cost * 0.1, 2), useful_life_years=life, status=status,
                                         warranty_until=self.today + timedelta(days=warranty_days))
        self.counters["asset"] = 10
        for requester, dept, purpose, lines, status in [
                ("turing", "School of Computing", "CS-301 graph algorithms lab", [("ELC-ARD", 6)], "pending"),
                ("castillo", "Library", "Reading room whiteboards", [("STN-MRK", 4)], "pending"),
                ("watanabe", "School of Engineering", "Embedded systems practical", [("ELC-SLD", 2), ("LAB-GOG", 10)], "approved"),
                ("okafor", "Clinic", "Clinic supplies", [("LAB-GLV", 4)], "issued")]:
            await self.ins("requisitions", req_no=self.code("requisition", "REQ-", 4), requester_user_id=self.staff_user[requester],
                           department=dept, purpose=purpose, status=status,
                           items=[{"item_id": str(items[s]), "sku": s, "qty": q} for s, q in lines],
                           decided_by=self.staff_user["becker"] if status != "pending" else None,
                           decided_at=self.ago(days=1) if status != "pending" else None, created_at=self.ago(days=2))
        for vendor, lines, status, days in [
                ("Office Depot Business", [("A4 Paper Ream", 200, 4.5), ("Ruled Notebook", 500, 1.2)], "received", 25),
                ("Techline Distributors", [("Projector Lamp", 5, 120.0), ("Laser Printer Toner", 20, 65.0)], "approved", 4),
                ("Universal Robots Partner", [("UR3e Robot Arm (teaching cell)", 1, 12500.0)], "pending_approval", 60)]:
            total = round(sum(q * c for _n, q, c in lines), 2)
            po = await self.ins("purchase_orders", po_no=self.code("po", "PO-", 4), vendor_name=vendor, total=total, status=status,
                                items=[{"name": n, "qty": q, "unit_cost": c} for n, q, c in lines], raised_by=self.staff_user["becker"],
                                received_at=self.ago(days=days - 5) if status == "received" else None, created_at=self.ago(hours=days * 1 if status == "pending_approval" else days * 24))
            if status == "pending_approval":
                self.pending_po = (po, vendor, total)
        for asset, title, priority, status, days in [("AST-0003", "Print head clogging", "high", "assigned", 3),
                                                     ("AST-0006", "AC not cooling in reading room", "normal", "open", 2),
                                                     ("AST-0002", "Projector colour cast", "low", "resolved", 9),
                                                     (None, "Door closer broken — Seminar Room 302", "normal", "resolved", 12)]:
            await self.ins("maintenance_tickets", ticket_no=self.code("maint", "MT-", 4), asset_id=assets.get(asset) if asset else None,
                           title=title, priority=priority, status=status, raised_by_user_id=self.staff_user["becker"],
                           assigned_to="Campus Facilities Team" if status != "open" else None,
                           resolved_at=self.ago(days=days - 2) if status == "resolved" else None,
                           resolution="Serviced by vendor" if status == "resolved" else None, created_at=self.ago(days=days))

    # ---------------------------------------------------------------- security
    async def security(self):
        mark = await self.ins("watchlist_entries", name="Mark Doyle", id_number="DL-99812234",
                              reason="Trespass incident — campus restraining order", severity="high")
        await self.ins("watchlist_entries", name="Unverified vendor representative", id_number="VND-000000",
                       reason="Repeated attempts to sell without authorisation", severity="medium")
        visitors = [("Rachel Green", "+1 555 900 1001", "passport", "P1234567", "turing", "Guest lecture on AI ethics"),
                    ("Tom Hardy", "+1 555 900 1002", "drivers_license", "DL-44556677", "jenkins", "Interview — lab assistant role"),
                    ("Mark Doyle", "+1 555 900 1003", "drivers_license", "DL-99812234", "raman", "Vendor meeting"),
                    ("Aisha Bello", "+1 555 900 1004", "national_id", "NID-778812", "hopper", "Industry advisory board"),
                    ("Ken Adams", "+1 555 900 1005", "drivers_license", "DL-12312312", "vance", "Campus recruitment — Northwind"),
                    ("Lucy Park", "+1 555 900 1006", "passport", "P7654321", "clarke", "Research collaboration"),
                    ("Omar Farid", "+1 555 900 1007", "national_id", "NID-445566", "principal", "Parent meeting"),
                    ("Nina Rossi", "+1 555 900 1008", "passport", "P1112223", "castillo", "Book donation drop-off")]
        for i, (name, phone, id_type, id_number, host, purpose) in enumerate(visitors):
            visitor = await self.ins("visitors", name=name, phone=phone, id_type=id_type, id_number=id_number)
            if i < 5 and name != "Mark Doyle":
                past = self.ago(days=i + 1, hours=3)
                await self.ins("visitor_passes", pass_no=self.code("visitor_pass", "VP-"), visitor_id=visitor, host_staff_id=self.staff[host],
                               host_user_id=self.staff_user[host], purpose=purpose, expected_at=past, checked_in_at=past,
                               checked_out_at=past + timedelta(hours=2), status="checked_out", badge_no=f"B-{100 + i}")
            expected = self.dt(self.today + timedelta(days=1 if i % 2 else 2), 10 + i % 5)
            if i in (2, 3, 5, 6):
                await self.ins("visitor_passes", pass_no=self.code("visitor_pass", "VP-"), visitor_id=visitor, host_staff_id=self.staff[host],
                               host_user_id=self.staff_user[host], purpose=purpose, expected_at=expected, status="pre_registered")
        rows = []
        for i in range(8):
            entered = self.ago(days=i, hours=5)
            rows.append({"reg_no": f"NY-{self.rng.randint(1000, 9999)}", "driver_name": self.rng.choice(["Delivery driver", "Contractor", "Guest"]),
                         "purpose": self.rng.choice(["Food delivery", "Maintenance contractor", "Guest parking", "Courier"]),
                         "entered_at": entered, "exited_at": entered + timedelta(hours=1), "registered": i != 3,
                         "logged_by": self.staff_user["osei"]})
        await self.many("vehicle_logs", rows)
        await self.many("patrol_logs", [{"guard_user_id": self.staff_user["osei"], "checkpoint": cp, "notes": "All clear",
                                         "logged_at": self.ago(days=d, hours=2)}
                                        for d in range(5) for cp in ("Main Gate", "Library Perimeter")])
        await self.ins("security_incidents", kind="drill", title="Evacuation drill — Academic Block", location="Academic Block",
                       severity="INFO", status="resolved", raised_by_user_id=self.staff_user["osei"], resolved_at=self.ago(days=20),
                       resolution="Mustering completed in 6m 40s", created_at=self.ago(days=20))
        await self.ins("security_incidents", kind="incident", title="Unattended bag near cafeteria", location="Cafeteria",
                       severity="WARNING", status="resolved", raised_by_user_id=self.staff_user["osei"], resolved_at=self.ago(days=4),
                       resolution="Owner identified — student's gym bag", created_at=self.ago(days=4))
        self.watchlist_mark = mark

    # ---------------------------------------------------------------- wellbeing
    async def wellbeing(self):
        liam = self.student_by_name["Liam Smith"]
        others = [s for s in self.students if s["programme"] == "BBA-DB"]
        severe_student = others[2]
        for student, days, category, severity, summary, status in [
                (liam, 12, "Academic conduct", "medium", "Repeated late submissions and class disruption", "open"),
                (liam, 4, "Attendance", "low", "Left CS-301 lab early without permission", "open"),
                (others[1], 8, "Conduct", "high", "Verbal altercation in the cafeteria", "under_review"),
                (severe_student, 30, "Bullying", "severe", "Online harassment of a classmate", "closed"),
                (others[4], 25, "Property", "low", "Damaged a library book", "closed")]:
            await self.ins("discipline_incidents", incident_no=self.code("incident", "DI-", 4), student_id=student["id"],
                           occurred_on=self.today - timedelta(days=days), category=category, severity=severity, summary=summary,
                           details="Full statement recorded by counsellor.", reported_by_user_id=self.staff_user["turing"] if student is liam else self.staff_user["haddad"],
                           status=status, resolution="Restorative meeting held; parents informed" if status == "closed" else None,
                           created_at=self.ago(days=days))
        await self.ins("counselling_sessions", student_id=liam["id"], counsellor_user_id=self.staff_user["park"],
                       scheduled_at=self.dt(self.add_school_days(self.today, 2), 11), status="scheduled",
                       intervention_plan="Weekly check-ins; study-skills coaching")
        await self.ins("counselling_sessions", student_id=severe_student["id"], counsellor_user_id=self.staff_user["park"],
                       scheduled_at=self.ago(days=7), status="completed",
                       notes_enc=encrypt_field("Student acknowledged impact; agreed to restorative steps. Follow-up in 2 weeks."),
                       intervention_plan="Restorative plan with class teacher")
        await self.ins("wellbeing_watchlist", student_id=severe_student["id"], reason="Severe bullying incident — monitoring",
                       status="active", added_at=self.ago(days=28))
        self.watchlist_request_student = liam

    # ---------------------------------------------------------------- accreditation
    async def accreditation(self):
        naac = await self.ins("accreditation_frameworks", code="NAAC", name="NAAC Institutional Accreditation", cycle=f"Cycle 3 — {self.today.year}")
        nba = await self.ins("accreditation_frameworks", code="NBA", name="NBA Programme Accreditation (Engineering)", cycle=f"{self.today.year}-{self.today.year + 3}")
        criteria = []
        for framework, code, title, weight, target in [
                (naac, "C1", "Curricular Aspects", 10, 5), (naac, "C2", "Teaching-Learning & Evaluation", 35, 6),
                (naac, "C3", "Research, Innovations & Extension", 12, 5), (naac, "C4", "Infrastructure & Learning Resources", 10, 4),
                (naac, "C5", "Student Support & Progression", 13, 5), (naac, "C6", "Governance, Leadership & Management", 10, 4),
                (naac, "C7", "Institutional Values & Best Practices", 10, 3),
                (nba, "P1", "Programme Outcomes Attainment", 40, 4), (nba, "P2", "Faculty Contributions", 30, 3),
                (nba, "P3", "Continuous Improvement", 30, 3)]:
            criteria.append((await self.ins("accreditation_criteria", framework_id=framework, code=code, title=title,
                                            weight=weight, target_evidence=target), code))
        titles = ["Academic calendar and term plan", "Syllabus revision minutes", "Attendance compliance summary",
                  "Report card publication log", "Library circulation statistics", "Placement outcomes summary",
                  "Faculty development participation", "Student grievance redressal minutes", "Infrastructure utilisation report",
                  "Scholarship disbursement summary", "Research publications list", "Governing body meeting minutes",
                  "Green campus initiatives", "Alumni engagement report"]
        owners = [self.staff_user[k] for k in ("principal", "hopper", "knuth", "castillo", "vance")]
        for i in range(26):
            criterion, code = criteria[i % len(criteria)]
            await self.ins("evidence_items", criterion_id=criterion, title=f"{titles[i % len(titles)]} ({code})",
                           description="Compiled from institutional records for the current cycle.",
                           status=["verified", "mapped", "verified", "draft"][i % 4], owner_user_id=owners[i % len(owners)])
        await self.ins("submission_packs", framework_id=naac, cycle=f"Cycle 3 — {self.today.year}", status="draft",
                       notes="Self Study Report data pack in preparation")
        staff_users = list(self.staff_user.values())
        for code, title, version, share in [("POL-COC", "Staff Code of Conduct", "v2.1", 0.6),
                                            ("POL-DPP", "Data Protection & Privacy Policy", "v1.0", 0.4),
                                            ("POL-ARG", "Anti-Ragging & Anti-Harassment Policy", "v1.2", 0.7)]:
            policy = await self.ins("policy_documents", code=code, title=title, version_label=version,
                                    body=f"# {title}\n\nThis policy sets expectations for all staff. Read fully and acknowledge.",
                                    published_at=self.ago(days=25))
            for uid in staff_users[: int(len(staff_users) * share)]:
                await self.ins("policy_acknowledgements", policy_id=policy, user_id=uid, acknowledged_at=self.ago(days=self.rng.randint(1, 20)))

    # ---------------------------------------------------------------- LMS & content
    async def lms(self):
        courses = [
            ("LMS-PY101", "Python for Data Science", "turing", "published", "Data", "#3b82f6",
             [("Getting started", ["Welcome and setup", "Variables and types", "Control flow"]),
              ("Working with data", ["NumPy essentials", "pandas DataFrames", "Cleaning messy data"]),
              ("Visualisation", ["Plotting fundamentals", "Storytelling with charts", "Mini project brief"])],
             [("Which Python type is immutable?", ["list", "dict", "tuple", "set"], 2),
              ("What does df.head() return by default?", ["First 5 rows", "Last 5 rows", "Column names", "Row count"], 0),
              ("Which library is used for n-dimensional arrays?", ["pandas", "NumPy", "matplotlib", "requests"], 1),
              ("How do you drop missing values in pandas?", ["df.dropna()", "df.fill()", "df.remove()", "df.clean()"], 0),
              ("A bar chart is best for…", ["Trends over time", "Comparing categories", "Correlation", "Distributions"], 1)]),
            ("LMS-RW201", "Research Writing Essentials", "clarke", "published", "Research", "#8b5cf6",
             [("Planning research", ["Framing a research question", "Literature search strategy", "Ethics basics"]),
              ("Writing up", ["Structuring a paper", "Citing sources", "Revising drafts"])],
             [("A good research question is…", ["Broad", "Specific and answerable", "Unrelated to literature", "Opinion-based"], 1),
              ("Plagiarism includes…", ["Citing sources", "Paraphrasing without credit", "Using quotes", "Peer review"], 1),
              ("An abstract should…", ["Summarise the study", "List references", "Include raw data", "Be 5 pages"], 0),
              ("Informed consent is required when…", ["Using public data", "Studying human participants", "Reading papers", "Writing"], 1)]),
            ("LMS-FL101", "Financial Literacy 101", "svensson", "published", "Business", "#10b981",
             [("Money basics", ["Budgeting", "Saving and emergency funds", "Understanding credit"]),
              ("Investing", ["Risk and return", "Diversification", "Compound interest"])],
             [("An emergency fund typically covers…", ["1 week", "3-6 months of expenses", "10 years", "Only rent"], 1),
              ("Diversification reduces…", ["All risk", "Unsystematic risk", "Inflation", "Taxes"], 1),
              ("Compound interest grows…", ["Linearly", "Exponentially over time", "Not at all", "Only monthly"], 1),
              ("A budget helps you…", ["Track and plan spending", "Avoid taxes", "Increase salary", "Skip savings"], 0)]),
            ("LMS-ROS301", "Robotics with ROS 2", "watanabe", "in_review", "Engineering", "#f59e0b",
             [("ROS 2 foundations", ["Nodes and topics", "Services and actions", "Launch files"]),
              ("Navigation", ["SLAM overview", "Nav2 stack", "Simulation with Gazebo"])], []),
        ]
        self.lms_courses = {}
        for code, title, instructor, status, category, color, modules, questions in courses:
            course = await self.ins("lms_courses", code=code, title=title, instructor_staff_id=self.staff[instructor],
                                    status=status, category=category, cover_color=color,
                                    description=f"A practical, self-paced course: {title}.",
                                    published_at=self.ago(days=30) if status == "published" else None)
            lessons = []
            for seq, (module_title, lesson_titles) in enumerate(modules, start=1):
                module = await self.ins("lms_modules", course_id=course, seq=seq, title=module_title)
                for lseq, lesson_title in enumerate(lesson_titles, start=1):
                    lessons.append(await self.ins(
                        "lms_lessons", module_id=module, seq=lseq, title=lesson_title, kind="reading",
                        duration_minutes=self.rng.choice([8, 10, 12, 15]),
                        content=(f"## {lesson_title}\n\nIn this lesson you will learn the essentials of "
                                 f"{lesson_title.lower()} as part of *{title}*.\n\n### Key ideas\n"
                                 f"- Why {lesson_title.lower()} matters\n- A worked example\n- Common pitfalls to avoid\n\n"
                                 f"### Try it\nComplete the short exercise at the end and mark the lesson complete.")))
            quiz = None
            if questions:
                quiz = await self.ins("quizzes", course_id=course, title=f"{title} — knowledge check", time_limit_minutes=10,
                                      pass_pct=60, status="published")
                for qseq, (text, options, correct) in enumerate(questions, start=1):
                    await self.ins("quiz_questions", quiz_id=quiz, seq=qseq, text=text, options=options, correct_index=correct, marks=1)
            self.lms_courses[code] = {"id": course, "lessons": lessons, "quiz": quiz, "questions": len(questions)}
        py = self.lms_courses["LMS-PY101"]
        enrol = await self.ins("lms_enrollments", course_id=py["id"], student_id=self.emma["id"],
                               progress_pct=round(4 / len(py["lessons"]) * 100, 2), created_at=self.ago(days=12))
        for lesson in py["lessons"][:4]:
            await self.ins("lesson_progress", enrollment_id=enrol, lesson_id=lesson, completed_at=self.ago(days=self.rng.randint(1, 10)))
        pool = [s for s in self.students if s is not self.emma]
        self.rng.shuffle(pool)
        for i, student in enumerate(pool[:24]):
            course = list(self.lms_courses.values())[i % 3]
            done = self.rng.randint(0, len(course["lessons"]))
            completed = done == len(course["lessons"])
            enrollment = await self.ins("lms_enrollments", course_id=course["id"], student_id=student["id"],
                                        progress_pct=round(done / len(course["lessons"]) * 100, 2),
                                        completed_at=self.ago(days=2) if completed else None,
                                        certificate_no=self.code("certificate", "CERT-") if completed else None)
            for lesson in course["lessons"][:done]:
                await self.ins("lesson_progress", enrollment_id=enrollment, lesson_id=lesson)
            if done >= 3 and course["quiz"]:
                score = self.rng.randint(2, course["questions"])
                flagged = i == 4
                await self.ins("quiz_attempts", quiz_id=course["quiz"], student_id=student["id"], started_at=self.ago(days=3, minutes=12),
                               submitted_at=self.ago(days=3), score=score, max_score=course["questions"],
                               passed=score / course["questions"] * 100 >= 60, status="submitted",
                               tab_switches=4 if flagged else 0, flagged=flagged,
                               malpractice_status="open" if flagged else "none",
                               question_order=list(range(course["questions"])), answers={})
        for title, kind, author, status, version in [("Lab safety induction slides", "slides", "watanabe", "published", 1),
                                                     ("Sorting algorithms visual explainer", "lesson", "turing", "published", 2),
                                                     ("Introduction to hypothesis testing", "lesson", "reyes", "in_review", 0),
                                                     ("Case study: launching a D2C brand", "lesson", "haddad", "draft", 0),
                                                     ("Accessibility checklist for course pages", "template", "hopper", "draft", 0)]:
            item = await self.ins("content_items", title=title, kind=kind, author_user_id=self.staff_user[author], status=status,
                                  published_version=version, tags=[kind],
                                  body=f"## {title}\n\nReusable content prepared for courses across departments.")
            if status == "in_review":
                self.content_in_review = (item, title)

    # ---------------------------------------------------------------- service desk
    async def service_desk(self):
        olivia = self.student_by_name["Olivia Williams"]
        noah = self.student_by_name["Noah Johnson"]
        william = self.student_by_name["William Brown"]
        for user, student, category, subtype, subject, status, created_days, sla_hours, assigned in [
                (olivia["user"], olivia, "document_request", "bonafide", "Bonafide certificate for visa application", "open", 1, 72, None),
                (noah["user"], noah, "it", None, "Wi-Fi login not working on my laptop", "resolved", 6, 24, "principal"),
                (self.emma["guardian_user"], self.emma, "document_request", "transcript", "Transcript copy for scholarship application", "in_progress", 2, 72, "principal"),
                (william["user"], william, "admin", "id_card", "ID card replacement — card damaged", "open", 5, 48, None)]:
            created = self.ago(days=created_days)
            await self.ins("service_tickets", ticket_no=self.code("ticket", "SR-"), requester_user_id=user, student_id=student["id"],
                           category=category, subtype=subtype, subject=subject, description=subject, status=status,
                           assigned_to_user_id=self.staff_user[assigned] if assigned else None,
                           sla_due_at=created + timedelta(hours=sla_hours), created_at=created,
                           resolved_at=created + timedelta(hours=5) if status == "resolved" else None,
                           resolution="Password reset and device re-registered" if status == "resolved" else None,
                           satisfaction=4 if status == "resolved" else None)
        await self.ins("appointments", requester_user_id=self.emma["guardian_user"], staff_id=self.staff["turing"],
                       student_id=self.emma["id"], starts_at=self.dt(self.add_school_days(self.today, 4), 15),
                       purpose="Discuss CS-301 project progress", status="confirmed")
        liam = self.student_by_name["Liam Smith"]
        await self.ins("appointments", requester_user_id=liam["guardian_user"], staff_id=self.staff["hopper"],
                       student_id=liam["id"], starts_at=self.dt(self.add_school_days(self.today, 3), 11),
                       purpose="Attendance and academic progress", status="requested")

    # ---------------------------------------------------------------- catalogued modules
    async def generic_modules(self):
        for path in sorted(SEED_DIR.glob("m*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            code = data.get("moduleId")
            if code not in GENERIC_MODULES:
                continue
            owner = self.staff_user["principal"]
            record_ids = []
            for i, record in enumerate(data.get("records", [])):
                tags = record.get("tags") or []
                record_ids.append(await self.ins(
                    "module_records", module_code=code, name=record.get("scope") or record.get("name"),
                    reference_code=record.get("referenceCode"), scope=data.get("description"),
                    category=tags[0] if tags else "General", status=record.get("status", "active"), tags=tags,
                    notes=None, amount=record.get("amount"), owner_user_id=owner, created_at=self.ago(days=20 - i)))
            for i, activity in enumerate(data.get("workflows", [])):
                await self.ins("module_activity", module_code=code,
                               record_id=record_ids[i % len(record_ids)] if record_ids else None,
                               title=activity.get("title", "Activity"), status=activity.get("status", "completed"),
                               actor_name=activity.get("actor"), occurred_at=self.ago(hours=6 * (i + 1)))

    # ---------------------------------------------------------------- approvals in flight
    async def pending_workflows(self):
        await self.seed_workflow("syllabus_publish", "syllabus_version", self.cs301_v2,
                                 "Publish CS-301 Data Structures & Algorithms syllabus v2", self.staff_user["turing"],
                                 summary="Adds a graph algorithms lab unit", hours_ago=5)
        student = self.pending_concession_student
        concession = await self.ins("concessions", student_id=student["id"], fee_head_id=self.fee_heads["TUI"], kind="percent",
                                    value=25, reason="Need-based scholarship — family income assessment", status="pending",
                                    requested_by=self.staff_user["raman"], created_at=self.ago(hours=20))
        wf = await self.seed_workflow("fee_concession", "concession", concession, f"25% tuition concession for {student['name']}",
                                      self.staff_user["raman"], summary="Need-based scholarship", hours_ago=20,
                                      payload={"student_id": str(student["id"]), "kind": "percent", "value": 25})
        await self.conn.execute("UPDATE concessions SET workflow_instance_id = $1 WHERE id = $2", wf, concession)
        concession_id, top = self.approved_concession
        approved = await self.seed_workflow("fee_concession", "concession", concession_id, f"10% merit scholarship for {top['name']}",
                                            self.staff_user["raman"], hours_ago=24 * 40, status="approved",
                                            decided_by=self.staff_user["principal"], comment="Approved per merit policy")
        await self.conn.execute("UPDATE concessions SET workflow_instance_id = $1 WHERE id = $2", approved, concession_id)
        wf = await self.seed_workflow("staff_leave", "staff_leave_request", self.hamilton_leave,
                                      "Casual leave — Prof. Margaret Hamilton (2 days)", self.staff_user["hamilton"], hours_ago=10)
        await self.conn.execute("UPDATE staff_leave_requests SET workflow_instance_id = $1 WHERE id = $2", wf, self.hamilton_leave)
        wf = await self.seed_workflow("staff_leave", "staff_leave_request", self.watanabe_leave, "Sick leave — Dr. Kenji Watanabe",
                                      self.staff_user["watanabe"], hours_ago=24 * 7, status="approved",
                                      decided_by=self.staff_user["moreno"], comment="Approved — rest well")
        await self.conn.execute("UPDATE staff_leave_requests SET workflow_instance_id = $1 WHERE id = $2", wf, self.watanabe_leave)
        po, vendor, total = self.pending_po
        wf = await self.seed_workflow("purchase_order", "purchase_order", po, f"Purchase order — {vendor} (${total:,.2f})",
                                      self.staff_user["becker"], summary="Above the PO approval threshold", hours_ago=60)
        await self.conn.execute("UPDATE purchase_orders SET workflow_instance_id = $1 WHERE id = $2", wf, po)
        await self.seed_workflow("lms_course_publish", "lms_course", self.lms_courses["LMS-ROS301"]["id"],
                                 "Publish online course: Robotics with ROS 2", self.staff_user["watanabe"], hours_ago=30)
        item, title = self.content_in_review
        await self.seed_workflow("content_publish", "content_item", item, f"Publish content: {title}", self.staff_user["reyes"], hours_ago=8)
        application, name = self.offer_pending_application
        await self.seed_workflow("admission_offer", "application", application, f"Issue admission offer to {name}",
                                 self.staff_user["brooks"], summary="Merit shortlist — general quota", hours_ago=4)
        resident = self.hostel_request_student
        await self.seed_workflow("hostel_reassignment", "room_allotment_request", resident["id"],
                                 f"Room change request — {resident['name']}", resident["user"],
                                 summary="Requests a quieter room for exam preparation",
                                 payload={"student_id": str(resident["id"]), "reason": "Noise near the common room"}, hours_ago=12)
        rider = next(s for s in self.transport_riders if s is not self.emma)
        new_stop = rider["route"]["stops"][2]
        await self.seed_workflow("transport_change", "transport_allocation", rider["id"], f"Stop change request — {rider['name']}",
                                 rider["guardian_user"], summary="Family moved closer to Riverside Park",
                                 payload={"student_id": str(rider["id"]), "route_id": str(rider["route"]["id"]), "stop_id": str(new_stop)},
                                 hours_ago=6)
        liam = self.watchlist_request_student
        entry = await self.ins("wellbeing_watchlist", student_id=liam["id"], reason="Repeat incidents + attendance shortage",
                               status="pending", created_at=self.ago(hours=3))
        wf = await self.seed_workflow("wellbeing_watchlist", "wellbeing_watchlist", entry, "Add Liam Smith to the wellbeing watchlist",
                                      self.staff_user["park"], payload={"action": "add"}, hours_ago=3)
        await self.conn.execute("UPDATE wellbeing_watchlist SET workflow_instance_id = $1 WHERE id = $2", wf, entry)
        if getattr(self, "attendance_sample", None):
            noah = self.student_by_name["Noah Johnson"]
            record = await self.conn.fetchrow("SELECT id, status FROM attendance_records WHERE session_id = $1 AND student_id = $2",
                                              self.attendance_sample, noah["id"])
            if record:
                correction = await self.ins("attendance_corrections", record_id=record["id"], old_status=record["status"],
                                            new_status="excused", reason="Representing the institute at the regional hackathon (dean's letter)",
                                            status="pending", requested_by=self.staff_user["turing"], created_at=self.ago(hours=2))
                wf = await self.seed_workflow("attendance_correction", "attendance_correction", correction,
                                              "Attendance correction — Noah Johnson (CS-301)", self.staff_user["turing"],
                                              payload={"record_id": str(record["id"]), "new_status": "excused"}, hours_ago=2)
                await self.conn.execute("UPDATE attendance_corrections SET workflow_instance_id = $1 WHERE id = $2", wf, correction)
        loan = getattr(self, "liam_fine_loan", None)
        if loan and loan[1] > 0:
            await self.seed_workflow("library_fine_waiver", "library_loan", loan[0], f"Waive library fine for Liam Smith (${loan[1]:.2f})",
                                     self.staff_user["castillo"], summary="Book returned late during medical absence",
                                     payload={"amount": loan[1]}, hours_ago=7)


async def seed_template(conn) -> dict:
    seeder = Seed(conn)
    async with conn.transaction():
        return await seeder.run()
