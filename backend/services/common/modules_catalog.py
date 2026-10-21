"""
The 64 product modules.
- kind 'dedicated': has its own API + screens.
- kind 'generic': catalogued module served by the generic records workspace (Build Spec §6, expand later).
"""
MODULES: list[tuple[str, str, str, str]] = [
    ("M01", "Platform Core", "core", "dedicated"),
    ("M02", "Identity & Security", "core", "dedicated"),
    ("M03", "Admissions & Enrolment", "lifecycle", "dedicated"),
    ("M04", "Student Information (SIS)", "lifecycle", "dedicated"),
    ("M05", "HR & Recruitment", "governance", "dedicated"),
    ("M06", "Payroll & Salary", "governance", "dedicated"),
    ("M07", "Academics & Curriculum", "academics", "dedicated"),
    ("M08", "Attendance", "operations", "dedicated"),
    ("M09", "Examination (offline)", "academics", "dedicated"),
    ("M10", "Online Exams & Proctoring", "academics", "dedicated"),
    ("M11", "LMS & Online Study", "academics", "dedicated"),
    ("M12", "Content Authoring Studio", "academics", "dedicated"),
    ("M13", "Homework & Assignments", "academics", "generic"),
    ("M14", "Library", "academics", "dedicated"),
    ("M15", "Fees & Finance", "finance", "dedicated"),
    ("M16", "Inventory & Assets", "finance", "dedicated"),
    ("M17", "Transport", "operations", "dedicated"),
    ("M18", "Hostel & Mess", "operations", "dedicated"),
    ("M19", "Communication Hub", "operations", "dedicated"),
    ("M20", "Parent & Student Portal", "lifecycle", "dedicated"),
    ("M21", "Events, Activities & Awards", "operations", "generic"),
    ("M22", "Discipline & Wellbeing", "lifecycle", "dedicated"),
    ("M23", "Placement & Career", "lifecycle", "dedicated"),
    ("M24", "Accreditation & Compliance", "governance", "dedicated"),
    ("M25", "Research & Publications", "governance", "generic"),
    ("M26", "Reports, BI & Analytics", "core", "dedicated"),
    ("M27", "Integrations", "core", "dedicated"),
    ("M28", "SaaS Ops Console", "core", "dedicated"),
    ("M29", "Marketing & Admissions CRM", "lifecycle", "generic"),
    ("M30", "Gradebook & Assessment", "academics", "dedicated"),
    ("M31", "Special Education & Inclusion", "academics", "generic"),
    ("M32", "Substitute & Cover", "governance", "generic"),
    ("M33", "Professional Development", "governance", "generic"),
    ("M34", "Financial Aid & Scholarships", "lifecycle", "generic"),
    ("M35", "Fundraising & Endowment", "finance", "generic"),
    ("M36", "Alumni Relations", "lifecycle", "generic"),
    ("M37", "Campus Card & Wallet", "finance", "dedicated"),
    ("M38", "Cafeteria & Canteen", "finance", "dedicated"),
    ("M39", "Campus Store & Commerce", "finance", "generic"),
    ("M40", "Visitor, Gate & Security", "operations", "dedicated"),
    ("M41", "Facility & Maintenance", "operations", "generic"),
    ("M42", "Smart Campus & IoT", "operations", "generic"),
    ("M43", "Health Centre & Telemedicine", "operations", "generic"),
    ("M44", "Sports & Athletics", "operations", "generic"),
    ("M45", "Early Years & Day Care", "operations", "generic"),
    ("M46", "Trips & Consent", "operations", "generic"),
    ("M47", "Grievance & Safeguarding", "operations", "generic"),
    ("M48", "Legal, Contracts & Insurance", "governance", "generic"),
    ("M49", "Documents & e-Signature", "operations", "generic"),
    ("M50", "Verifiable Credentials", "operations", "generic"),
    ("M51", "International Students", "lifecycle", "generic"),
    ("M52", "Study Abroad & Credit Transfer", "operations", "generic"),
    ("M53", "Internships & Apprenticeships", "operations", "generic"),
    ("M54", "Coaching & Test-Prep", "academics", "generic"),
    ("M55", "Franchise & Chain", "governance", "generic"),
    ("M56", "Course & Faculty Feedback", "academics", "generic"),
    ("M57", "Service Desk & Student Services", "lifecycle", "dedicated"),
    ("M58", "Volunteering, PTA & Community", "operations", "generic"),
    ("M59", "Sustainability & ESG", "operations", "generic"),
    ("M60", "Migration & Onboarding Toolkit", "core", "generic"),
    ("M61", "Partner & Marketplace", "core", "generic"),
    ("M62", "Trust Centre & Certifications", "core", "generic"),
    ("M63", "White-label App Factory", "core", "generic"),
    ("M64", "Offline & Edge Node", "core", "generic"),
]

MODULE_NAMES = {code: name for code, name, _p, _k in MODULES}
GENERIC_MODULES = {code for code, _n, _p, kind in MODULES if kind == "generic"}
# Sensitive catalogued modules: records restricted to modules.generic.manage (never general staff)
SENSITIVE_GENERIC = {"M31", "M35", "M43", "M47"}
# Always-on core modules cannot be disabled
CORE_MODULES = {"M01", "M02", "M26"}

PLANS = {
    "standard": {"name": "Standard (Wave 1 core)", "max_students": 2000,
                 "modules": ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M15", "M19", "M20",
                             "M26", "M30", "M57"]},
    "enterprise": {"name": "Enterprise (all modules)", "max_students": None,
                   "modules": [code for code, *_ in MODULES]},
}
