// Auto-generated registry of all 64 Product Modules (M01 to M64)

export type PortalKey = 'core' | 'lifecycle' | 'academics' | 'governance' | 'finance' | 'operations';

export interface PortalMeta {
  key: PortalKey;
  name: string;
  description: string;
  badge: string;
}

export const PORTALS: Record<PortalKey, PortalMeta> = {
  core: {
    key: 'core',
    name: 'Core Platform & SaaS Ops',
    description: 'Multi-tenancy, Identity, Integrations, App Factory & Trust',
    badge: 'Portal 1'
  },
  lifecycle: {
    key: 'lifecycle',
    name: 'Student Lifecycle & CRM',
    description: 'Admissions, SIS 360, Portals, Financial Aid, Alumni & Service Desk',
    badge: 'Portal 2'
  },
  academics: {
    key: 'academics',
    name: 'Academics & LMS Wedge',
    description: 'Curriculum, Online Exams, LMS Studio, Gradebook, IEP & Feedback',
    badge: 'Portal 3'
  },
  governance: {
    key: 'governance',
    name: 'Workforce & Governance',
    description: 'HR Registry, Payroll, Accreditation, Research, Substitute & Contracts',
    badge: 'Portal 4'
  },
  finance: {
    key: 'finance',
    name: 'Finance & Commerce',
    description: 'Fee Collections, Assets, Smart Cards, Cafeteria POS & Store',
    badge: 'Portal 5'
  },
  operations: {
    key: 'operations',
    name: 'Campus Life & Facilities',
    description: 'Attendance, Transport, Hostel, Events, IoT, Health & Safeguarding',
    badge: 'Portal 6'
  }
};

export interface ModuleItem {
  id: string;
  title: string;
  portal: PortalKey;
  route: string;
  status: 'implemented' | 'planned';
  tags: string[];
  summary: string;
  bulletsCount: number;
}

export const MODULES_REGISTRY: ModuleItem[] = [
  {
    "id": "M01",
    "title": "Platform Core",
    "portal": "core",
    "route": "/setup",
    "status": "implemented",
    "tags": [],
    "summary": "Multi-tenancy, isolation, data residency",
    "bulletsCount": 10
  },
  {
    "id": "M02",
    "title": "Identity & Security",
    "portal": "core",
    "route": "/login",
    "status": "implemented",
    "tags": [],
    "summary": "SSO (OIDC/SAML), Google & Microsoft login",
    "bulletsCount": 7
  },
  {
    "id": "M03",
    "title": "Admissions & Enrolment",
    "portal": "lifecycle",
    "route": "/admissions",
    "status": "implemented",
    "tags": [
      "OCR",
      "Lead scoring",
      "RAG chatbot"
    ],
    "summary": "Enquiry capture: web, walk-in, call, campaign",
    "bulletsCount": 9
  },
  {
    "id": "M04",
    "title": "Student Information (SIS)",
    "portal": "lifecycle",
    "route": "/students",
    "status": "implemented",
    "tags": [],
    "summary": "Student 360: academic, financial, health, conduct",
    "bulletsCount": 7
  },
  {
    "id": "M05",
    "title": "HR & Recruitment",
    "portal": "governance",
    "route": "/hr/staff",
    "status": "implemented",
    "tags": [
      "Resume parsing",
      "JD matching",
      "Attrition risk"
    ],
    "summary": "Staff directory, designations, reporting lines",
    "bulletsCount": 9
  },
  {
    "id": "M06",
    "title": "Payroll & Salary",
    "portal": "governance",
    "route": "/payroll/dashboard",
    "status": "implemented",
    "tags": [
      "Anomaly detection"
    ],
    "summary": "Pay structures, grades, allowances, deductions",
    "bulletsCount": 7
  },
  {
    "id": "M07",
    "title": "Academics & Curriculum",
    "portal": "academics",
    "route": "/operations/timetable",
    "status": "implemented",
    "tags": [
      "Constraint optimisation",
      "Knowledge graph"
    ],
    "summary": "Programme, course, subject, elective catalogue",
    "bulletsCount": 8
  },
  {
    "id": "M08",
    "title": "Attendance",
    "portal": "operations",
    "route": "/attendance/daily",
    "status": "implemented",
    "tags": [
      "Face recognition",
      "Anti-spoof",
      "Anomaly"
    ],
    "summary": "Biometric, RFID, face, QR, geo-fence, manual",
    "bulletsCount": 6
  },
  {
    "id": "M09",
    "title": "Examination (offline)",
    "portal": "academics",
    "route": "/modules/m09",
    "status": "planned",
    "tags": [
      "Question generation",
      "OMR / OCR",
      "Handwriting"
    ],
    "summary": "Exam types, schemes, grading, weightage",
    "bulletsCount": 10
  },
  {
    "id": "M10",
    "title": "Online Exams & Proctoring",
    "portal": "academics",
    "route": "/lms/quiz",
    "status": "implemented",
    "tags": [
      "CV proctoring",
      "Audio ML",
      "LLM-as-judge"
    ],
    "summary": "Question types: MCQ, MSQ, numeric, descriptive, coding, audio",
    "bulletsCount": 7
  },
  {
    "id": "M11",
    "title": "LMS & Online Study",
    "portal": "academics",
    "route": "/lms",
    "status": "implemented",
    "tags": [
      "AI tutor",
      "RAG",
      "Recommenders"
    ],
    "summary": "Course catalogue, cohorts, drip content, prerequisites",
    "bulletsCount": 8
  },
  {
    "id": "M12",
    "title": "Content Authoring Studio",
    "portal": "academics",
    "route": "/lms/course-builder",
    "status": "implemented",
    "tags": [
      "Diffusion",
      "TTS",
      "Multimodal"
    ],
    "summary": "Course builder, module / lesson tree",
    "bulletsCount": 6
  },
  {
    "id": "M13",
    "title": "Homework & Assignments",
    "portal": "academics",
    "route": "/modules/m13",
    "status": "planned",
    "tags": [
      "Rubric prompting",
      "Similarity"
    ],
    "summary": "Creation, attachments, due dates, late policy",
    "bulletsCount": 4
  },
  {
    "id": "M14",
    "title": "Library",
    "portal": "academics",
    "route": "/library/catalog",
    "status": "implemented",
    "tags": [
      "Semantic search",
      "Recommenders"
    ],
    "summary": "Catalogue, accession register, ISBN/RFID/barcode",
    "bulletsCount": 6
  },
  {
    "id": "M15",
    "title": "Fees & Finance",
    "portal": "finance",
    "route": "/finance",
    "status": "implemented",
    "tags": [
      "Default prediction",
      "Invoice parsing",
      "Collection agent"
    ],
    "summary": "Fee heads & structures per course/batch/category",
    "bulletsCount": 10
  },
  {
    "id": "M16",
    "title": "Inventory & Assets",
    "portal": "finance",
    "route": "/inventory/assets",
    "status": "implemented",
    "tags": [
      "Demand forecasting",
      "Reorder agent"
    ],
    "summary": "Stores, categories, stock, batch/serial tracking",
    "bulletsCount": 7
  },
  {
    "id": "M17",
    "title": "Transport",
    "portal": "operations",
    "route": "/transport/live",
    "status": "implemented",
    "tags": [
      "Route optimisation",
      "ETA prediction",
      "Geo ML"
    ],
    "summary": "Routes, stops, vehicles, drivers, attendants",
    "bulletsCount": 7
  },
  {
    "id": "M18",
    "title": "Hostel & Mess",
    "portal": "operations",
    "route": "/campus/hostel",
    "status": "implemented",
    "tags": [
      "Forecasting",
      "Text classification"
    ],
    "summary": "Blocks, rooms, beds, allotment and vacate",
    "bulletsCount": 5
  },
  {
    "id": "M19",
    "title": "Communication Hub",
    "portal": "operations",
    "route": "/communications/broadcast",
    "status": "implemented",
    "tags": [
      "Drafting",
      "Translation",
      "Sentiment"
    ],
    "summary": "Announcements, circulars, notice board, targeted broadcast",
    "bulletsCount": 7
  },
  {
    "id": "M20",
    "title": "Parent & Student Portal",
    "portal": "lifecycle",
    "route": "/portal/parent",
    "status": "implemented",
    "tags": [
      "Voice assistant",
      "Text-to-SQL"
    ],
    "summary": "Attendance, marks, homework, timetable, fees",
    "bulletsCount": 5
  },
  {
    "id": "M21",
    "title": "Events, Activities & Awards",
    "portal": "operations",
    "route": "/modules/m21",
    "status": "planned",
    "tags": [
      "Image generation",
      "Planning agent"
    ],
    "summary": "Academic calendar, event planning, budgets, approvals",
    "bulletsCount": 6
  },
  {
    "id": "M22",
    "title": "Discipline & Wellbeing",
    "portal": "lifecycle",
    "route": "/students/wellbeing",
    "status": "implemented",
    "tags": [
      "Risk classification",
      "Sentiment",
      "Privacy"
    ],
    "summary": "Incident logging, severity, action workflow",
    "bulletsCount": 5
  },
  {
    "id": "M23",
    "title": "Placement & Career",
    "portal": "operations",
    "route": "/career/placements",
    "status": "implemented",
    "tags": [
      "Embeddings matching",
      "Voice agent",
      "Ranking"
    ],
    "summary": "Company registry, MOUs, recruiter portal",
    "bulletsCount": 8
  },
  {
    "id": "M24",
    "title": "Accreditation & Compliance",
    "portal": "governance",
    "route": "/accreditation/dashboard",
    "status": "implemented",
    "tags": [
      "RAG",
      "Summarisation"
    ],
    "summary": "NAAC / NBA / NIRF / AICTE / UGC / board data packs",
    "bulletsCount": 7
  },
  {
    "id": "M25",
    "title": "Research & Publications",
    "portal": "governance",
    "route": "/modules/m25",
    "status": "planned",
    "tags": [
      "Semantic search",
      "Similarity"
    ],
    "summary": "Research projects, grants, funding, milestones",
    "bulletsCount": 4
  },
  {
    "id": "M26",
    "title": "Reports, BI & Analytics",
    "portal": "operations",
    "route": "/modules/m26",
    "status": "planned",
    "tags": [
      "NL2SQL",
      "Insight narration",
      "Forecasting"
    ],
    "summary": "Role-based dashboards: owner, principal, HOD, teacher, parent",
    "bulletsCount": 6
  },
  {
    "id": "M27",
    "title": "Integrations",
    "portal": "core",
    "route": "/modules/m27",
    "status": "planned",
    "tags": [],
    "summary": "Payment gateways; accounting (Tally/Zoho/QuickBooks)",
    "bulletsCount": 7
  },
  {
    "id": "M28",
    "title": "SaaS Ops Console",
    "portal": "core",
    "route": "/modules/m28",
    "status": "planned",
    "tags": [],
    "summary": "Tenant provisioning, plans, quotas",
    "bulletsCount": 6
  },
  {
    "id": "M29",
    "title": "Marketing & Admissions CRM",
    "portal": "lifecycle",
    "route": "/modules/m29",
    "status": "planned",
    "tags": [
      "Lead scoring",
      "Copy generation",
      "Attribution"
    ],
    "summary": "Campaigns, ad-spend attribution, cost per admission",
    "bulletsCount": 7
  },
  {
    "id": "M30",
    "title": "Gradebook & Assessment",
    "portal": "academics",
    "route": "/academics/gradebook",
    "status": "implemented",
    "tags": [
      "Standards mapping",
      "Comment generation"
    ],
    "summary": "Weighted categories, formative vs summative",
    "bulletsCount": 7
  },
  {
    "id": "M31",
    "title": "Special Education & Inclusion",
    "portal": "academics",
    "route": "/modules/m31",
    "status": "planned",
    "tags": [
      "Plan drafting",
      "Progress analysis"
    ],
    "summary": "Referral, screening, eligibility determination",
    "bulletsCount": 7
  },
  {
    "id": "M32",
    "title": "Substitute & Cover",
    "portal": "governance",
    "route": "/modules/m32",
    "status": "planned",
    "tags": [
      "Matching",
      "Optimisation"
    ],
    "summary": "Absence reporting and approval",
    "bulletsCount": 6
  },
  {
    "id": "M33",
    "title": "Professional Development",
    "portal": "governance",
    "route": "/modules/m33",
    "status": "planned",
    "tags": [
      "Skill gap",
      "Recommenders"
    ],
    "summary": "Training catalogue, mandatory vs elective",
    "bulletsCount": 6
  },
  {
    "id": "M34",
    "title": "Financial Aid & Scholarships",
    "portal": "lifecycle",
    "route": "/modules/m34",
    "status": "planned",
    "tags": [
      "Eligibility matching",
      "Document AI"
    ],
    "summary": "Aid application, need assessment, packaging",
    "bulletsCount": 7
  },
  {
    "id": "M35",
    "title": "Fundraising & Endowment",
    "portal": "finance",
    "route": "/modules/m35",
    "status": "planned",
    "tags": [
      "Propensity to give",
      "Appeal drafting"
    ],
    "summary": "Donor CRM, segmentation, giving history",
    "bulletsCount": 7
  },
  {
    "id": "M36",
    "title": "Alumni Relations",
    "portal": "lifecycle",
    "route": "/modules/m36",
    "status": "planned",
    "tags": [
      "Engagement scoring",
      "Matching"
    ],
    "summary": "Alumni directory, chapters, class years",
    "bulletsCount": 6
  },
  {
    "id": "M37",
    "title": "Campus Card & Wallet",
    "portal": "finance",
    "route": "/modules/m37",
    "status": "planned",
    "tags": [
      "Fraud detection",
      "Spend anomaly"
    ],
    "summary": "One identity across gate, library, canteen, transport, printing, labs",
    "bulletsCount": 6
  },
  {
    "id": "M38",
    "title": "Cafeteria & Canteen",
    "portal": "finance",
    "route": "/cafeteria/pos",
    "status": "implemented",
    "tags": [
      "Demand forecasting",
      "Menu generation"
    ],
    "summary": "Menu planning, recipes, nutrition, allergens",
    "bulletsCount": 6
  },
  {
    "id": "M39",
    "title": "Campus Store & Commerce",
    "portal": "finance",
    "route": "/modules/m39",
    "status": "planned",
    "tags": [
      "Recommenders",
      "Forecasting"
    ],
    "summary": "Bookstore, uniforms, stationery, lab kits, merchandise",
    "bulletsCount": 6
  },
  {
    "id": "M40",
    "title": "Visitor, Gate & Security",
    "portal": "operations",
    "route": "/security/visitors",
    "status": "implemented",
    "tags": [
      "Face / ANPR",
      "Anomaly detection"
    ],
    "summary": "Visitor pre-registration, QR gate pass, badge printing",
    "bulletsCount": 7
  },
  {
    "id": "M41",
    "title": "Facility & Maintenance",
    "portal": "operations",
    "route": "/modules/m41",
    "status": "planned",
    "tags": [
      "Predictive maintenance",
      "Ticket triage"
    ],
    "summary": "Building, floor, room and space inventory",
    "bulletsCount": 7
  },
  {
    "id": "M42",
    "title": "Smart Campus & IoT",
    "portal": "operations",
    "route": "/modules/m42",
    "status": "planned",
    "tags": [
      "Edge inference",
      "Anomaly detection"
    ],
    "summary": "Device fleet: biometric, RFID, cameras, smart boards",
    "bulletsCount": 6
  },
  {
    "id": "M43",
    "title": "Health Centre & Telemedicine",
    "portal": "operations",
    "route": "/modules/m43",
    "status": "planned",
    "tags": [
      "Triage assist",
      "Outbreak detection"
    ],
    "summary": "Appointments, walk-ins, sick bay, triage",
    "bulletsCount": 7
  },
  {
    "id": "M44",
    "title": "Sports & Athletics",
    "portal": "operations",
    "route": "/modules/m44",
    "status": "planned",
    "tags": [
      "Pose estimation",
      "Injury risk"
    ],
    "summary": "Teams, squads, tryouts, selection",
    "bulletsCount": 6
  },
  {
    "id": "M45",
    "title": "Early Years & Day Care",
    "portal": "operations",
    "route": "/modules/m45",
    "status": "planned",
    "tags": [
      "Photo tagging",
      "Milestone insights"
    ],
    "summary": "Developmental milestones and observation portfolios",
    "bulletsCount": 6
  },
  {
    "id": "M46",
    "title": "Trips & Consent",
    "portal": "operations",
    "route": "/modules/m46",
    "status": "planned",
    "tags": [
      "Risk drafting"
    ],
    "summary": "Trip planning, itinerary, costing, capacity",
    "bulletsCount": 6
  },
  {
    "id": "M47",
    "title": "Grievance & Safeguarding",
    "portal": "operations",
    "route": "/modules/m47",
    "status": "planned",
    "tags": [
      "Risk language detection",
      "Privacy"
    ],
    "summary": "Anonymous complaint intake and whistleblowing",
    "bulletsCount": 7
  },
  {
    "id": "M48",
    "title": "Legal, Contracts & Insurance",
    "portal": "governance",
    "route": "/modules/m48",
    "status": "planned",
    "tags": [
      "Clause extraction",
      "Renewal alerts"
    ],
    "summary": "Contract lifecycle: draft, approve, sign, renew, terminate",
    "bulletsCount": 6
  },
  {
    "id": "M49",
    "title": "Documents & e-Signature",
    "portal": "operations",
    "route": "/modules/m49",
    "status": "planned",
    "tags": [
      "OCR",
      "Semantic search"
    ],
    "summary": "Central document store with folders, tags, permissions",
    "bulletsCount": 6
  },
  {
    "id": "M50",
    "title": "Verifiable Credentials",
    "portal": "operations",
    "route": "/modules/m50",
    "status": "planned",
    "tags": [
      "Forgery detection",
      "Revenue line"
    ],
    "summary": "Tamper-evident transcripts, diplomas, mark sheets",
    "bulletsCount": 6
  },
  {
    "id": "M51",
    "title": "International Students",
    "portal": "lifecycle",
    "route": "/modules/m51",
    "status": "planned",
    "tags": [
      "Credential mapping",
      "Translation"
    ],
    "summary": "International application and credential evaluation",
    "bulletsCount": 7
  },
  {
    "id": "M52",
    "title": "Study Abroad & Credit Transfer",
    "portal": "operations",
    "route": "/modules/m52",
    "status": "planned",
    "tags": [
      "Syllabus similarity",
      "Knowledge graph"
    ],
    "summary": "Partner university registry and agreements",
    "bulletsCount": 5
  },
  {
    "id": "M53",
    "title": "Internships & Apprenticeships",
    "portal": "operations",
    "route": "/modules/m53",
    "status": "planned",
    "tags": [
      "Matching",
      "Log summarisation"
    ],
    "summary": "Internship registry, industry partners, MOUs",
    "bulletsCount": 6
  },
  {
    "id": "M54",
    "title": "Coaching & Test-Prep",
    "portal": "academics",
    "route": "/modules/m54",
    "status": "planned",
    "tags": [
      "Rank prediction",
      "Adaptive testing"
    ],
    "summary": "Batch and doubt-session scheduling",
    "bulletsCount": 6
  },
  {
    "id": "M55",
    "title": "Franchise & Chain",
    "portal": "governance",
    "route": "/modules/m55",
    "status": "planned",
    "tags": [
      "Benchmarking",
      "Forecasting"
    ],
    "summary": "Franchisee onboarding, agreements, territory rights",
    "bulletsCount": 6
  },
  {
    "id": "M56",
    "title": "Course & Faculty Feedback",
    "portal": "academics",
    "route": "/modules/m56",
    "status": "planned",
    "tags": [
      "Sentiment",
      "Theme extraction"
    ],
    "summary": "Course evaluation surveys per term",
    "bulletsCount": 6
  },
  {
    "id": "M57",
    "title": "Service Desk & Student Services",
    "portal": "lifecycle",
    "route": "/modules/m57",
    "status": "planned",
    "tags": [
      "Ticket triage",
      "RAG deflection"
    ],
    "summary": "One-stop catalogue: IT, admin, hostel, transport, finance",
    "bulletsCount": 6
  },
  {
    "id": "M58",
    "title": "Volunteering, PTA & Community",
    "portal": "operations",
    "route": "/modules/m58",
    "status": "planned",
    "tags": [],
    "summary": "PTA committees, elections, meetings, minutes",
    "bulletsCount": 5
  },
  {
    "id": "M59",
    "title": "Sustainability & ESG",
    "portal": "operations",
    "route": "/modules/m59",
    "status": "planned",
    "tags": [
      "Forecasting",
      "Report narration"
    ],
    "summary": "Energy, water, waste and paper consumption tracking",
    "bulletsCount": 5
  },
  {
    "id": "M60",
    "title": "Migration & Onboarding Toolkit",
    "portal": "core",
    "route": "/modules/m60",
    "status": "planned",
    "tags": [
      "Schema matching",
      "Agents"
    ],
    "summary": "Importers for competitor systems and spreadsheets",
    "bulletsCount": 6
  },
  {
    "id": "M61",
    "title": "Partner & Marketplace",
    "portal": "core",
    "route": "/modules/m61",
    "status": "planned",
    "tags": [],
    "summary": "Reseller and implementation-partner portal",
    "bulletsCount": 6
  },
  {
    "id": "M62",
    "title": "Trust Centre & Certifications",
    "portal": "core",
    "route": "/modules/m62",
    "status": "planned",
    "tags": [],
    "summary": "Public trust page: security, privacy, uptime, subprocessors",
    "bulletsCount": 7
  },
  {
    "id": "M63",
    "title": "White-label App Factory",
    "portal": "core",
    "route": "/modules/m63",
    "status": "planned",
    "tags": [],
    "summary": "Per-tenant branded app build and store publishing",
    "bulletsCount": 5
  },
  {
    "id": "M64",
    "title": "Offline & Edge Node",
    "portal": "core",
    "route": "/modules/m64",
    "status": "planned",
    "tags": [
      "Small models",
      "On-device"
    ],
    "summary": "Local sync server for low-connectivity campuses",
    "bulletsCount": 6
  }
];
