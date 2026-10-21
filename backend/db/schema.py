"""
Database schema: master registry + tenant template.
- Every tenant table carries the standard system fields (Build Spec §1.1) via __SYS__.
- Post-processing adds: updated_at/version trigger, row-level security policy per tenant_id, app-role grants.
- audit_log is append-only: no UPDATE/DELETE grant and a blocking trigger.
"""
from services.common.config import APP_DB_USER

SYS = """
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    campus_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    deleted_at timestamptz,
    version integer NOT NULL DEFAULT 1,
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','api','ai_agent','system')),"""

MASTER_SQL = f"""
CREATE TABLE IF NOT EXISTS tenants (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    db_name text NOT NULL UNIQUE,
    admin_email text NOT NULL,
    status text NOT NULL DEFAULT 'provisioning'
        CHECK (status IN ('provisioning','active','suspended','offboarding','archived')),
    plan text NOT NULL DEFAULT 'enterprise',
    suspended_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tenant_events (
    id bigserial PRIMARY KEY,
    tenant_slug text NOT NULL,
    event_code text NOT NULL,
    actor text,
    detail jsonb NOT NULL DEFAULT '{{}}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS plans (
    code text PRIMARY KEY,
    name text NOT NULL,
    modules jsonb NOT NULL DEFAULT '[]',
    max_students integer
);
GRANT USAGE ON SCHEMA public TO {APP_DB_USER};
GRANT SELECT, UPDATE ON tenants TO {APP_DB_USER};
GRANT SELECT ON plans TO {APP_DB_USER};
GRANT SELECT, INSERT ON tenant_events TO {APP_DB_USER};
GRANT USAGE, SELECT ON SEQUENCE tenant_events_id_seq TO {APP_DB_USER};
"""

FUNCTIONS_SQL = """
CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    NEW.version := OLD.version + 1;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END $$;
"""

TENANT_TABLES_SQL = """
CREATE TABLE code_sequences (key text PRIMARY KEY, value bigint NOT NULL DEFAULT 0);

-- ============ M01 Platform Core ============
CREATE TABLE institution (__SYS__
    name text NOT NULL, legal_name text, short_code text, country text,
    currency text NOT NULL DEFAULT 'USD', timezone text NOT NULL DEFAULT 'UTC', locale text NOT NULL DEFAULT 'en',
    logo_url text, primary_color text NOT NULL DEFAULT '#58a6ff', secondary_color text NOT NULL DEFAULT '#d2a8ff',
    domain text, contact_email text, contact_phone text, address text,
    refund_approval_threshold numeric(12,2) NOT NULL DEFAULT 1000,
    fine_waiver_threshold numeric(12,2) NOT NULL DEFAULT 20,
    po_approval_threshold numeric(12,2) NOT NULL DEFAULT 5000,
    attendance_cutoff_hour integer NOT NULL DEFAULT 18,
    attendance_shortage_pct numeric(5,2) NOT NULL DEFAULT 75,
    attendance_critical_pct numeric(5,2) NOT NULL DEFAULT 65,
    fee_reminder_interval_days integer NOT NULL DEFAULT 3,
    fee_overdue_warning_days integer NOT NULL DEFAULT 7,
    defaulter_days integer NOT NULL DEFAULT 30,
    library_fine_per_day numeric(8,2) NOT NULL DEFAULT 1,
    library_loan_days integer NOT NULL DEFAULT 14,
    library_max_loans integer NOT NULL DEFAULT 3,
    hostel_curfew time NOT NULL DEFAULT '21:30',
    admission_fee numeric(12,2) NOT NULL DEFAULT 1500,
    status text NOT NULL DEFAULT 'active'
);
CREATE TABLE campuses (__SYS__
    code text NOT NULL UNIQUE, name text NOT NULL, address text, city text,
    is_main boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE departments (__SYS__
    code text NOT NULL UNIQUE, name text NOT NULL, head_staff_id uuid,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE academic_years (__SYS__
    name text NOT NULL UNIQUE, start_date date NOT NULL, end_date date NOT NULL,
    status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','closed')),
    closed_at timestamptz, closed_by uuid
);
CREATE TABLE terms (__SYS__
    academic_year_id uuid NOT NULL REFERENCES academic_years(id), name text NOT NULL,
    start_date date NOT NULL, end_date date NOT NULL
);
CREATE TABLE holidays (__SYS__
    holiday_date date NOT NULL, name text NOT NULL, kind text NOT NULL DEFAULT 'holiday'
);
CREATE TABLE feature_flags (__SYS__
    module_code text NOT NULL UNIQUE, name text NOT NULL, portal text,
    kind text NOT NULL DEFAULT 'dedicated', enabled boolean NOT NULL DEFAULT true, in_plan boolean NOT NULL DEFAULT true
);
CREATE TABLE api_keys (__SYS__
    name text NOT NULL, key_prefix text NOT NULL, key_hash text NOT NULL UNIQUE, scopes jsonb NOT NULL DEFAULT '[]',
    last_used_at timestamptz, expires_at timestamptz, revoked_at timestamptz
);
CREATE TABLE webhooks (__SYS__
    url text NOT NULL, event_codes jsonb NOT NULL DEFAULT '[]', secret text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    failure_count integer NOT NULL DEFAULT 0, last_delivery_at timestamptz
);
CREATE TABLE webhook_deliveries (__SYS__
    webhook_id uuid NOT NULL REFERENCES webhooks(id), event_code text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
    attempts integer NOT NULL DEFAULT 0, response_code integer, response_body text, next_attempt_at timestamptz
);
CREATE TABLE files (__SYS__
    owner_type text, owner_id text, filename text NOT NULL, content_type text, size_bytes bigint NOT NULL DEFAULT 0,
    storage_key text NOT NULL, category text NOT NULL DEFAULT 'general', legal_hold boolean NOT NULL DEFAULT false,
    retention_until date, uploaded_by uuid
);

-- ============ M02 Identity ============
CREATE TABLE roles (__SYS__
    key text NOT NULL UNIQUE, name text NOT NULL, description text,
    is_system boolean NOT NULL DEFAULT false, permissions jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE guardians (__SYS__
    name text NOT NULL, email text, phone text, occupation text, address text
);
CREATE TABLE salary_grades (__SYS__
    code text NOT NULL UNIQUE, name text NOT NULL,
    hra_pct numeric(5,2) NOT NULL DEFAULT 0, da_pct numeric(5,2) NOT NULL DEFAULT 0,
    pf_pct numeric(5,2) NOT NULL DEFAULT 0, tax_pct numeric(5,2) NOT NULL DEFAULT 0
);
CREATE TABLE staff (__SYS__
    staff_no text NOT NULL UNIQUE, name text NOT NULL, email text NOT NULL, phone text,
    department_id uuid REFERENCES departments(id), designation text NOT NULL,
    employment_type text NOT NULL DEFAULT 'full_time', joining_date date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','exited')),
    salary_grade_code text, base_salary numeric(12,2) NOT NULL DEFAULT 0, manager_staff_id uuid,
    is_substitute_pool boolean NOT NULL DEFAULT false, qualifications text, exited_at date, exit_reason text
);
CREATE TABLE programmes (__SYS__
    code text NOT NULL UNIQUE, name text NOT NULL, short_code text NOT NULL,
    department_id uuid REFERENCES departments(id), level text NOT NULL DEFAULT 'undergraduate',
    duration_years integer NOT NULL DEFAULT 4, intake_capacity integer NOT NULL DEFAULT 60,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE students (__SYS__
    roll_no text UNIQUE, name text NOT NULL, email text, phone text, dob date, gender text,
    programme_id uuid REFERENCES programmes(id), cohort integer, current_semester integer, section text DEFAULT 'A',
    status text NOT NULL DEFAULT 'active' CHECK (status IN
        ('enquiry','applicant','enrolled','active','on_leave','suspended','alumni','transferred_out','withdrawn')),
    admission_date date, address text, emergency_contact_name text, emergency_contact_phone text,
    photo_url text, cgpa numeric(4,2), merged_into_id uuid
);
CREATE TABLE users (__SYS__
    email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL,
    role_key text NOT NULL REFERENCES roles(key),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','locked')),
    phone text, avatar_url text,
    staff_id uuid REFERENCES staff(id), student_id uuid REFERENCES students(id), guardian_id uuid REFERENCES guardians(id),
    is_demo_persona boolean NOT NULL DEFAULT false, persona_title text, persona_description text, persona_order integer,
    mfa_enabled boolean NOT NULL DEFAULT false, mfa_secret_enc text, mfa_pending_secret_enc text,
    failed_login_count integer NOT NULL DEFAULT 0, locked_until timestamptz,
    last_login_at timestamptz, password_changed_at timestamptz
);
CREATE TABLE sessions (__SYS__
    user_id uuid NOT NULL REFERENCES users(id), jti text NOT NULL UNIQUE, ip text, user_agent text,
    expires_at timestamptz NOT NULL, revoked_at timestamptz, revoked_reason text,
    impersonator_user_id uuid, impersonation_reason text
);
CREATE TABLE consent_records (__SYS__
    user_id uuid NOT NULL REFERENCES users(id), policy_code text NOT NULL, policy_version text NOT NULL,
    scope text NOT NULL, granted_for text NOT NULL DEFAULT 'self' CHECK (granted_for IN ('self','minor')),
    subject_student_id uuid, granted_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz
);

-- ============ Cross-cutting ============
CREATE TABLE audit_log (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    event_code text NOT NULL, actor_id uuid, actor_type text NOT NULL DEFAULT 'user', actor_role text,
    impersonator_id uuid, entity_type text, entity_id text, before jsonb, after jsonb, reason text,
    ip text, device text, source text, request_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (__SYS__
    user_id uuid NOT NULL REFERENCES users(id), event_code text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('INFO','ACTION','WARNING','CRITICAL')),
    category text NOT NULL DEFAULT 'general', title text NOT NULL, body text, link text,
    entity_type text, entity_id text, throttle_key text, read_at timestamptz, acknowledged_at timestamptz
);
CREATE TABLE notification_deliveries (__SYS__
    notification_id uuid NOT NULL REFERENCES notifications(id), channel text NOT NULL,
    status text NOT NULL CHECK (status IN ('delivered','queued','sent','failed','skipped')),
    provider_response text, attempts integer NOT NULL DEFAULT 1
);
CREATE TABLE notification_preferences (__SYS__
    user_id uuid NOT NULL REFERENCES users(id), category text NOT NULL, channel text NOT NULL,
    enabled boolean NOT NULL DEFAULT true, UNIQUE (user_id, category, channel)
);
CREATE TABLE workflow_definitions (__SYS__
    type text NOT NULL UNIQUE, name text NOT NULL, description text, steps jsonb NOT NULL,
    sla_hours numeric(6,2) NOT NULL DEFAULT 24, active boolean NOT NULL DEFAULT true
);
CREATE TABLE workflow_instances (__SYS__
    type text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, title text NOT NULL, summary text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','returned','withdrawn')),
    current_step integer NOT NULL DEFAULT 1, payload jsonb NOT NULL DEFAULT '{}', result jsonb NOT NULL DEFAULT '{}',
    submitted_by uuid REFERENCES users(id), decided_at timestamptz
);
CREATE TABLE workflow_steps (__SYS__
    instance_id uuid NOT NULL REFERENCES workflow_instances(id), step_no integer NOT NULL, label text NOT NULL,
    approver_permission text NOT NULL,
    status text NOT NULL CHECK (status IN ('waiting','pending','approved','rejected','returned','skipped')),
    decided_by uuid REFERENCES users(id), comment text, decided_at timestamptz, due_at timestamptz,
    escalated_at timestamptz, UNIQUE (instance_id, step_no)
);
CREATE TABLE workflow_delegations (__SYS__
    from_user_id uuid NOT NULL REFERENCES users(id), to_user_id uuid NOT NULL REFERENCES users(id),
    starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, reason text, revoked_at timestamptz
);
CREATE TABLE job_runs (__SYS__
    job_code text NOT NULL, status text NOT NULL CHECK (status IN ('running','completed','failed')),
    started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
    summary jsonb NOT NULL DEFAULT '{}', error text
);
CREATE TABLE service_tickets (__SYS__
    ticket_no text NOT NULL UNIQUE, requester_user_id uuid NOT NULL REFERENCES users(id),
    category text NOT NULL, subtype text, student_id uuid REFERENCES students(id),
    subject text NOT NULL, description text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    priority text NOT NULL DEFAULT 'normal', assigned_to_user_id uuid REFERENCES users(id),
    sla_due_at timestamptz, warned_at timestamptz, escalated_at timestamptz, resolved_at timestamptz,
    resolution text, satisfaction integer CHECK (satisfaction BETWEEN 1 AND 5)
);
CREATE TABLE appointments (__SYS__
    requester_user_id uuid NOT NULL REFERENCES users(id), staff_id uuid NOT NULL REFERENCES staff(id),
    student_id uuid REFERENCES students(id), starts_at timestamptz NOT NULL, purpose text NOT NULL,
    status text NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested','confirmed','declined','completed','cancelled')), notes text
);

-- ============ M04 SIS ============
CREATE TABLE guardian_student_links (__SYS__
    guardian_id uuid NOT NULL REFERENCES guardians(id), student_id uuid NOT NULL REFERENCES students(id),
    relationship text NOT NULL, has_custody boolean NOT NULL DEFAULT true, can_pickup boolean NOT NULL DEFAULT true,
    is_emergency_contact boolean NOT NULL DEFAULT false, portal_access boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    UNIQUE (guardian_id, student_id)
);
CREATE TABLE health_records (__SYS__
    student_id uuid NOT NULL UNIQUE REFERENCES students(id), blood_group text,
    allergies_enc text, conditions_enc text, immunisations jsonb NOT NULL DEFAULT '[]',
    severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal','critical')),
    clinic_acknowledged_at timestamptz, clinic_acknowledged_by uuid
);
CREATE TABLE id_cards (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), card_no text NOT NULL UNIQUE,
    issued_at timestamptz NOT NULL DEFAULT now(), valid_until date NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked'))
);
CREATE TABLE student_documents (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), doc_type text NOT NULL, title text NOT NULL,
    file_id uuid REFERENCES files(id),
    direction text NOT NULL DEFAULT 'submitted' CHECK (direction IN ('submitted','issued')),
    mandatory boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','issued')),
    verified_by uuid, verified_at timestamptz, remarks text, reference_no text
);
CREATE TABLE student_status_history (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), from_status text, to_status text NOT NULL,
    reason text, effective_date date, workflow_instance_id uuid
);

-- ============ M03 Admissions ============
CREATE TABLE enquiries (__SYS__
    enquiry_no text NOT NULL UNIQUE, name text NOT NULL, email text, phone text,
    source_channel text NOT NULL DEFAULT 'web' CHECK (source_channel IN ('web','walk_in','call','campaign','referral')),
    programme_id uuid REFERENCES programmes(id), counsellor_user_id uuid REFERENCES users(id),
    stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','applied','lost','converted')),
    lost_reason text, notes text, last_contacted_at timestamptz
);
CREATE TABLE applications (__SYS__
    application_no text NOT NULL UNIQUE, enquiry_id uuid REFERENCES enquiries(id),
    applicant_name text NOT NULL, email text, phone text, dob date, gender text,
    programme_id uuid NOT NULL REFERENCES programmes(id),
    guardian_name text, guardian_email text, guardian_phone text, prior_score numeric(5,2),
    quota text NOT NULL DEFAULT 'general',
    status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','documents_verified',
        'shortlisted','waitlisted','offer_pending','offered','accepted','confirmed','rejected','withdrawn')),
    merit_rank integer, offer_notes text, offer_issued_at timestamptz, accepted_at timestamptz,
    confirmed_at timestamptz, student_id uuid REFERENCES students(id), rejection_reason text
);
CREATE TABLE application_documents (__SYS__
    application_id uuid NOT NULL REFERENCES applications(id), doc_type text NOT NULL, file_id uuid REFERENCES files(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
    verified_by uuid, verified_at timestamptz, remarks text
);

-- ============ M07 Academics / M09 Exams ============
CREATE TABLE rooms (__SYS__
    code text NOT NULL UNIQUE, name text NOT NULL, room_type text NOT NULL DEFAULT 'lecture',
    capacity integer NOT NULL DEFAULT 40, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE courses (__SYS__
    code text NOT NULL UNIQUE, title text NOT NULL, programme_id uuid REFERENCES programmes(id),
    department_id uuid REFERENCES departments(id), credits integer NOT NULL DEFAULT 3, semester integer,
    course_type text NOT NULL DEFAULT 'core', description text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE course_sections (__SYS__
    course_id uuid NOT NULL REFERENCES courses(id), term_id uuid NOT NULL REFERENCES terms(id),
    section_code text NOT NULL DEFAULT 'A', teacher_staff_id uuid REFERENCES staff(id), room_id uuid REFERENCES rooms(id),
    capacity integer NOT NULL DEFAULT 60, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
    UNIQUE (course_id, term_id, section_code)
);
CREATE TABLE enrollments (__SYS__
    section_id uuid NOT NULL REFERENCES course_sections(id), student_id uuid NOT NULL REFERENCES students(id),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','dropped','completed')),
    UNIQUE (section_id, student_id)
);
CREATE TABLE syllabus_versions (__SYS__
    course_id uuid NOT NULL REFERENCES courses(id), version_no integer NOT NULL, title text NOT NULL,
    content text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','published','archived')),
    submitted_by uuid, published_at timestamptz, UNIQUE (course_id, version_no)
);
CREATE TABLE timetables (__SYS__
    term_id uuid NOT NULL REFERENCES terms(id), name text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','published','archived')),
    published_at timestamptz, published_by uuid
);
CREATE TABLE timetable_slots (__SYS__
    timetable_id uuid NOT NULL REFERENCES timetables(id), section_id uuid NOT NULL REFERENCES course_sections(id),
    day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time time NOT NULL, end_time time NOT NULL, room_id uuid REFERENCES rooms(id),
    CHECK (end_time > start_time)
);
CREATE TABLE substitutions (__SYS__
    slot_id uuid NOT NULL REFERENCES timetable_slots(id), class_date date NOT NULL,
    original_staff_id uuid NOT NULL REFERENCES staff(id), substitute_staff_id uuid REFERENCES staff(id), reason text,
    status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','cancelled','unfilled')),
    responded_at timestamptz, escalated_at timestamptz
);
CREATE TABLE exam_schedules (__SYS__
    section_id uuid NOT NULL REFERENCES course_sections(id), exam_type text NOT NULL DEFAULT 'midterm',
    exam_date date NOT NULL, start_time time NOT NULL, duration_minutes integer NOT NULL DEFAULT 120,
    room_id uuid REFERENCES rooms(id),
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','rescheduled','cancelled','completed')),
    change_reason text
);
CREATE TABLE invigilator_duties (__SYS__
    exam_schedule_id uuid NOT NULL REFERENCES exam_schedules(id), staff_id uuid NOT NULL REFERENCES staff(id)
);

-- ============ M08 Attendance ============
CREATE TABLE attendance_sessions (__SYS__
    section_id uuid NOT NULL REFERENCES course_sections(id), session_date date NOT NULL,
    slot_id uuid REFERENCES timetable_slots(id), method text NOT NULL DEFAULT 'manual',
    marked_by uuid, marked_at timestamptz
);
CREATE TABLE attendance_records (__SYS__
    session_id uuid NOT NULL REFERENCES attendance_sessions(id), student_id uuid NOT NULL REFERENCES students(id),
    status text NOT NULL CHECK (status IN ('present','absent','late','excused')),
    method text NOT NULL DEFAULT 'manual', remark text, corrected boolean NOT NULL DEFAULT false,
    UNIQUE (session_id, student_id)
);
CREATE TABLE attendance_corrections (__SYS__
    record_id uuid NOT NULL REFERENCES attendance_records(id), old_status text NOT NULL, new_status text NOT NULL,
    reason text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    requested_by uuid, workflow_instance_id uuid
);
CREATE TABLE leave_requests (__SYS__
    request_no text NOT NULL UNIQUE, student_id uuid NOT NULL REFERENCES students(id),
    kind text NOT NULL DEFAULT 'leave' CHECK (kind IN ('leave','regularisation')), leave_type text NOT NULL,
    start_date date NOT NULL, end_date date NOT NULL, days integer NOT NULL DEFAULT 1, reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
    requested_by_user_id uuid REFERENCES users(id), reviewed_by_user_id uuid REFERENCES users(id),
    reviewed_at timestamptz, review_comment text, CHECK (end_date >= start_date)
);

-- ============ M30 Gradebook ============
CREATE TABLE assessment_categories (__SYS__
    section_id uuid NOT NULL REFERENCES course_sections(id), name text NOT NULL, weight numeric(5,2) NOT NULL
);
CREATE TABLE assessments (__SYS__
    section_id uuid NOT NULL REFERENCES course_sections(id), category_id uuid NOT NULL REFERENCES assessment_categories(id),
    title text NOT NULL, max_marks numeric(6,2) NOT NULL CHECK (max_marks > 0), assessment_date date
);
CREATE TABLE marks (__SYS__
    assessment_id uuid NOT NULL REFERENCES assessments(id), student_id uuid NOT NULL REFERENCES students(id),
    marks_obtained numeric(6,2), remarks text, UNIQUE (assessment_id, student_id)
);
CREATE TABLE grade_sheets (__SYS__
    section_id uuid NOT NULL UNIQUE REFERENCES course_sections(id),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','teacher_submitted','hod_reviewed','published')),
    submitted_by uuid, submitted_at timestamptz, reviewed_by uuid, reviewed_at timestamptz, review_comment text,
    published_by uuid, published_at timestamptz, anomaly_flags jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE report_cards (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), term_label text NOT NULL, term_id uuid REFERENCES terms(id),
    version_no integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','superseded')),
    data jsonb NOT NULL DEFAULT '{}', gpa numeric(4,2), credits integer,
    published_at timestamptz NOT NULL DEFAULT now(), change_reason text
);
CREATE TABLE grade_change_requests (__SYS__
    mark_id uuid NOT NULL REFERENCES marks(id), section_id uuid NOT NULL REFERENCES course_sections(id),
    student_id uuid NOT NULL REFERENCES students(id), old_marks numeric(6,2), new_marks numeric(6,2) NOT NULL,
    reason text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    requested_by uuid, workflow_instance_id uuid
);

-- ============ M15 Fees ============
CREATE TABLE fee_heads (__SYS__
    code text NOT NULL UNIQUE, name text NOT NULL, category text NOT NULL DEFAULT 'academic'
);
CREATE TABLE fee_structures (__SYS__
    name text NOT NULL, academic_year_id uuid NOT NULL REFERENCES academic_years(id),
    programme_id uuid REFERENCES programmes(id), cohort integer,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','assigned')), assigned_at timestamptz
);
CREATE TABLE fee_structure_items (__SYS__
    structure_id uuid NOT NULL REFERENCES fee_structures(id), fee_head_id uuid NOT NULL REFERENCES fee_heads(id),
    description text NOT NULL, amount numeric(12,2) NOT NULL CHECK (amount >= 0), due_date date NOT NULL
);
CREATE TABLE concessions (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), fee_head_id uuid REFERENCES fee_heads(id),
    kind text NOT NULL CHECK (kind IN ('percent','amount')), value numeric(12,2) NOT NULL CHECK (value > 0),
    reason text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    requested_by uuid, workflow_instance_id uuid
);
CREATE TABLE invoices (__SYS__
    invoice_no text NOT NULL UNIQUE, student_id uuid NOT NULL REFERENCES students(id),
    structure_item_id uuid REFERENCES fee_structure_items(id), fee_head_id uuid REFERENCES fee_heads(id),
    description text NOT NULL, amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    concession_amount numeric(12,2) NOT NULL DEFAULT 0, fine_amount numeric(12,2) NOT NULL DEFAULT 0,
    paid_amount numeric(12,2) NOT NULL DEFAULT 0, due_date date NOT NULL,
    status text NOT NULL DEFAULT 'generated'
        CHECK (status IN ('generated','partially_paid','paid','overdue','waived','written_off')),
    last_reminder_at timestamptz, overdue_warned_at timestamptz, defaulter_flagged_at timestamptz,
    closure_reason text, origin_module text NOT NULL DEFAULT 'fees'
);
CREATE TABLE invoice_adjustments (__SYS__
    invoice_id uuid NOT NULL REFERENCES invoices(id), kind text NOT NULL, amount numeric(12,2) NOT NULL DEFAULT 0,
    reason text NOT NULL, before jsonb NOT NULL DEFAULT '{}', after jsonb NOT NULL DEFAULT '{}', actor_user_id uuid
);
CREATE TABLE payments (__SYS__
    payment_no text NOT NULL UNIQUE, invoice_id uuid NOT NULL REFERENCES invoices(id),
    student_id uuid NOT NULL REFERENCES students(id), amount numeric(12,2) NOT NULL CHECK (amount > 0),
    method text NOT NULL, gateway text, gateway_ref text UNIQUE,
    status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','success','failed','reversed')),
    paid_at timestamptz, recorded_by_user_id uuid, payer_user_id uuid, reference text,
    failure_reason text, reversal_reason text
);
CREATE TABLE receipts (__SYS__
    receipt_no text NOT NULL UNIQUE, payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
    issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refunds (__SYS__
    refund_no text NOT NULL UNIQUE, payment_id uuid NOT NULL REFERENCES payments(id),
    amount numeric(12,2) NOT NULL CHECK (amount > 0), reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','issued','rejected')),
    workflow_instance_id uuid, issued_at timestamptz, requested_by uuid
);

-- ============ M19 Communication ============
CREATE TABLE announcements (__SYS__
    title text NOT NULL, body text NOT NULL,
    kind text NOT NULL DEFAULT 'announcement' CHECK (kind IN ('announcement','circular','broadcast','emergency')),
    audience jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','published','rejected')),
    is_drill boolean NOT NULL DEFAULT false, published_at timestamptz, published_by uuid,
    recipients_count integer NOT NULL DEFAULT 0, author_user_id uuid
);
CREATE TABLE chat_threads (__SYS__
    subject text NOT NULL, student_id uuid REFERENCES students(id), created_by_user_id uuid REFERENCES users(id),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), last_message_at timestamptz
);
CREATE TABLE chat_participants (__SYS__
    thread_id uuid NOT NULL REFERENCES chat_threads(id), user_id uuid NOT NULL REFERENCES users(id),
    UNIQUE (thread_id, user_id)
);
CREATE TABLE chat_messages (__SYS__
    thread_id uuid NOT NULL REFERENCES chat_threads(id), sender_user_id uuid NOT NULL REFERENCES users(id),
    body text NOT NULL, flagged boolean NOT NULL DEFAULT false, flag_reason text,
    hidden boolean NOT NULL DEFAULT false, moderated_by uuid, moderated_at timestamptz, moderation_note text
);
CREATE TABLE ptm_slots (__SYS__
    staff_id uuid NOT NULL REFERENCES staff(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
    location text, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','cancelled','completed')),
    guardian_user_id uuid REFERENCES users(id), student_id uuid REFERENCES students(id),
    booked_at timestamptz, notes text
);

-- ============ M26 Reports ============
CREATE TABLE report_schedules (__SYS__
    report_code text NOT NULL, name text NOT NULL, params jsonb NOT NULL DEFAULT '{}',
    frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
    recipient_user_ids jsonb NOT NULL DEFAULT '[]', next_run_at timestamptz NOT NULL, last_run_at timestamptz,
    owner_user_id uuid REFERENCES users(id),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused'))
);
CREATE TABLE custom_reports (__SYS__
    name text NOT NULL, dataset text NOT NULL, config jsonb NOT NULL DEFAULT '{}', owner_user_id uuid REFERENCES users(id)
);

-- ============ M05 HR / M06 Payroll ============
CREATE TABLE staff_leave_requests (__SYS__
    request_no text NOT NULL UNIQUE, staff_id uuid NOT NULL REFERENCES staff(id), leave_type text NOT NULL,
    start_date date NOT NULL, end_date date NOT NULL, days numeric(5,1) NOT NULL, reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
    decided_by uuid, decided_at timestamptz, comment text, workflow_instance_id uuid, CHECK (end_date >= start_date)
);
CREATE TABLE staff_leave_balances (__SYS__
    staff_id uuid NOT NULL REFERENCES staff(id), leave_type text NOT NULL, year integer NOT NULL,
    allotted numeric(5,1) NOT NULL DEFAULT 0, used numeric(5,1) NOT NULL DEFAULT 0,
    UNIQUE (staff_id, leave_type, year)
);
CREATE TABLE payroll_runs (__SYS__
    run_no text NOT NULL UNIQUE, period text NOT NULL,
    run_type text NOT NULL DEFAULT 'regular' CHECK (run_type IN ('regular','supplementary')),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','calculated','pending_approval','locked','disbursed')),
    total_gross numeric(14,2) NOT NULL DEFAULT 0, total_net numeric(14,2) NOT NULL DEFAULT 0,
    staff_count integer NOT NULL DEFAULT 0, calculated_at timestamptz, locked_at timestamptz, disbursed_at timestamptz,
    parent_run_id uuid, notes text, anomaly_flags jsonb NOT NULL DEFAULT '[]', workflow_instance_id uuid
);
CREATE TABLE payslips (__SYS__
    run_id uuid NOT NULL REFERENCES payroll_runs(id), staff_id uuid NOT NULL REFERENCES staff(id),
    basic numeric(12,2) NOT NULL DEFAULT 0, allowances jsonb NOT NULL DEFAULT '{}', deductions jsonb NOT NULL DEFAULT '{}',
    gross numeric(12,2) NOT NULL DEFAULT 0, net numeric(12,2) NOT NULL DEFAULT 0,
    lop_days numeric(5,1) NOT NULL DEFAULT 0, working_days integer NOT NULL DEFAULT 0,
    UNIQUE (run_id, staff_id)
);

-- ============ M14 Library ============
CREATE TABLE library_items (__SYS__
    accession_no text NOT NULL UNIQUE, isbn text, title text NOT NULL, author text, publisher text, category text,
    published_year integer, shelf text,
    copies_total integer NOT NULL DEFAULT 1 CHECK (copies_total >= 0),
    copies_available integer NOT NULL DEFAULT 1 CHECK (copies_available >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','lost','weeded')),
    is_digital boolean NOT NULL DEFAULT false, digital_url text
);
CREATE TABLE library_loans (__SYS__
    loan_no text NOT NULL UNIQUE, item_id uuid NOT NULL REFERENCES library_items(id),
    borrower_user_id uuid NOT NULL REFERENCES users(id), student_id uuid REFERENCES students(id),
    status text NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested','issued','returned','rejected','lost','cancelled')),
    requested_at timestamptz, issued_at timestamptz, due_date date, returned_at timestamptz,
    renew_count integer NOT NULL DEFAULT 0, fine_amount numeric(8,2) NOT NULL DEFAULT 0,
    fine_waived_amount numeric(8,2) NOT NULL DEFAULT 0,
    fine_status text NOT NULL DEFAULT 'none' CHECK (fine_status IN ('none','pending','invoiced','waived','paid')),
    fine_invoice_id uuid REFERENCES invoices(id), issued_by uuid, notes text, last_overdue_notice_at timestamptz
);
CREATE TABLE library_reservations (__SYS__
    item_id uuid NOT NULL REFERENCES library_items(id), user_id uuid NOT NULL REFERENCES users(id),
    status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','ready','fulfilled','cancelled')),
    ready_at timestamptz
);

-- ============ M23 Placement ============
CREATE TABLE companies (__SYS__
    name text NOT NULL UNIQUE, industry text, website text, contact_name text, contact_email text,
    mou_status text NOT NULL DEFAULT 'pending' CHECK (mou_status IN ('pending','approved','rejected')),
    mou_valid_until date, notes text
);
CREATE TABLE job_postings (__SYS__
    posting_no text NOT NULL UNIQUE, company_id uuid NOT NULL REFERENCES companies(id), title text NOT NULL,
    kind text NOT NULL DEFAULT 'job' CHECK (kind IN ('job','internship')), ctc numeric(12,2), ctc_text text,
    location text, min_cgpa numeric(4,2) NOT NULL DEFAULT 0, eligible_programme_ids jsonb NOT NULL DEFAULT '[]',
    min_semester integer NOT NULL DEFAULT 1, openings integer NOT NULL DEFAULT 1, deadline date, drive_date date,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','archived')), description text
);
CREATE TABLE drive_rounds (__SYS__
    posting_id uuid NOT NULL REFERENCES job_postings(id), round_no integer NOT NULL, name text NOT NULL,
    scheduled_at timestamptz, status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed')),
    UNIQUE (posting_id, round_no)
);
CREATE TABLE placement_applications (__SYS__
    posting_id uuid NOT NULL REFERENCES job_postings(id), student_id uuid NOT NULL REFERENCES students(id),
    stage text NOT NULL DEFAULT 'applied' CHECK (stage IN
        ('applied','shortlisted','in_rounds','offered','accepted','declined','rejected','withdrawn')),
    current_round integer NOT NULL DEFAULT 0, notes text, UNIQUE (posting_id, student_id)
);
CREATE TABLE offers (__SYS__
    application_id uuid NOT NULL UNIQUE REFERENCES placement_applications(id), ctc numeric(12,2) NOT NULL,
    joining_date date, status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','declined')),
    offered_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz
);

-- ============ M18 Hostel ============
CREATE TABLE hostel_blocks (__SYS__
    name text NOT NULL UNIQUE, gender text, warden_staff_id uuid REFERENCES staff(id)
);
CREATE TABLE hostel_rooms (__SYS__
    block_id uuid NOT NULL REFERENCES hostel_blocks(id), room_no text NOT NULL, room_type text NOT NULL DEFAULT 'double',
    capacity integer NOT NULL DEFAULT 2 CHECK (capacity > 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance')), UNIQUE (block_id, room_no)
);
CREATE TABLE room_allotments (__SYS__
    room_id uuid NOT NULL REFERENCES hostel_rooms(id), student_id uuid NOT NULL REFERENCES students(id),
    bed_no integer NOT NULL, from_date date NOT NULL, to_date date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','vacated'))
);
CREATE TABLE hostel_movements (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), direction text NOT NULL CHECK (direction IN ('out','in')),
    moved_at timestamptz NOT NULL DEFAULT now(), reason text, expected_return_at timestamptz,
    late boolean NOT NULL DEFAULT false, logged_by uuid
);
CREATE TABLE hostel_complaints (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), room_id uuid REFERENCES hostel_rooms(id),
    category text NOT NULL, description text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
    resolved_at timestamptz, resolution text
);

-- ============ M17 Transport ============
CREATE TABLE vehicles (__SYS__
    reg_no text NOT NULL UNIQUE, model text, capacity integer NOT NULL DEFAULT 40, driver_name text, driver_phone text,
    permit_expiry date, insurance_expiry date, fitness_expiry date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','retired'))
);
CREATE TABLE routes (__SYS__
    code text NOT NULL UNIQUE, name text NOT NULL, vehicle_id uuid REFERENCES vehicles(id),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE route_stops (__SYS__
    route_id uuid NOT NULL REFERENCES routes(id), seq integer NOT NULL, name text NOT NULL, pickup_time time NOT NULL,
    lat numeric(9,6), lng numeric(9,6), UNIQUE (route_id, seq)
);
CREATE TABLE transport_allocations (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), route_id uuid NOT NULL REFERENCES routes(id),
    stop_id uuid NOT NULL REFERENCES route_stops(id), from_date date NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended'))
);
CREATE TABLE trips (__SYS__
    route_id uuid NOT NULL REFERENCES routes(id), trip_date date NOT NULL,
    direction text NOT NULL CHECK (direction IN ('pickup','drop')),
    status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
    started_at timestamptz, ended_at timestamptz, last_lat numeric(9,6), last_lng numeric(9,6), last_ping_at timestamptz,
    delay_minutes integer NOT NULL DEFAULT 0, current_stop_seq integer NOT NULL DEFAULT 0, started_by uuid
);
CREATE TABLE transport_incidents (__SYS__
    trip_id uuid REFERENCES trips(id), route_id uuid REFERENCES routes(id),
    kind text NOT NULL CHECK (kind IN ('sos','breakdown','accident','delay','other')), description text NOT NULL,
    severity text NOT NULL DEFAULT 'WARNING', status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    reported_by_user_id uuid, resolved_at timestamptz, resolution text
);

-- ============ M37 Wallet / M38 Cafeteria ============
CREATE TABLE wallets (__SYS__
    student_id uuid NOT NULL UNIQUE REFERENCES students(id), card_no text NOT NULL UNIQUE,
    balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0), daily_limit numeric(12,2) NOT NULL DEFAULT 50,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')), blocked_reason text
);
CREATE TABLE wallet_transactions (__SYS__
    txn_no text NOT NULL UNIQUE, wallet_id uuid NOT NULL REFERENCES wallets(id),
    kind text NOT NULL CHECK (kind IN ('topup','spend','refund')), amount numeric(12,2) NOT NULL CHECK (amount > 0),
    balance_after numeric(12,2) NOT NULL, channel text, reference text, actor_user_id uuid,
    flagged boolean NOT NULL DEFAULT false
);
CREATE TABLE menu_items (__SYS__
    name text NOT NULL, category text NOT NULL, price numeric(8,2) NOT NULL CHECK (price >= 0),
    is_veg boolean NOT NULL DEFAULT true, allergens jsonb NOT NULL DEFAULT '[]', calories integer,
    active boolean NOT NULL DEFAULT true
);
CREATE TABLE pos_orders (__SYS__
    order_no text NOT NULL UNIQUE, student_id uuid REFERENCES students(id), items jsonb NOT NULL,
    total numeric(10,2) NOT NULL, payment_method text NOT NULL CHECK (payment_method IN ('wallet','cash')),
    status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded')),
    cashier_user_id uuid, wallet_transaction_id uuid
);

-- ============ M16 Inventory ============
CREATE TABLE inventory_items (__SYS__
    sku text NOT NULL UNIQUE, name text NOT NULL, category text, uom text NOT NULL DEFAULT 'unit',
    stock_qty numeric(12,2) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0), reorder_level numeric(12,2) NOT NULL DEFAULT 0,
    unit_cost numeric(12,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','obsolete')), reorder_warned_at timestamptz
);
CREATE TABLE stock_movements (__SYS__
    item_id uuid NOT NULL REFERENCES inventory_items(id),
    kind text NOT NULL CHECK (kind IN ('issue','return','grn','adjust')), qty numeric(12,2) NOT NULL,
    reference text, actor_user_id uuid
);
CREATE TABLE assets (__SYS__
    asset_tag text NOT NULL UNIQUE, name text NOT NULL, category text, location text, purchase_date date,
    cost numeric(12,2) NOT NULL DEFAULT 0, salvage_value numeric(12,2) NOT NULL DEFAULT 0,
    useful_life_years integer NOT NULL DEFAULT 5,
    status text NOT NULL DEFAULT 'in_use'
        CHECK (status IN ('in_use','in_store','under_maintenance','pending_write_off','written_off')),
    assigned_to text, warranty_until date
);
CREATE TABLE requisitions (__SYS__
    req_no text NOT NULL UNIQUE, requester_user_id uuid NOT NULL REFERENCES users(id), department text, purpose text,
    items jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','issued','rejected')),
    decided_by uuid, decided_at timestamptz, comment text
);
CREATE TABLE purchase_orders (__SYS__
    po_no text NOT NULL UNIQUE, vendor_name text NOT NULL, items jsonb NOT NULL, total numeric(14,2) NOT NULL,
    status text NOT NULL DEFAULT 'pending_approval'
        CHECK (status IN ('pending_approval','approved','received','rejected','cancelled')),
    workflow_instance_id uuid, received_at timestamptz, raised_by uuid
);
CREATE TABLE maintenance_tickets (__SYS__
    ticket_no text NOT NULL UNIQUE, asset_id uuid REFERENCES assets(id), title text NOT NULL, description text,
    priority text NOT NULL DEFAULT 'normal',
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','resolved')), assigned_to text,
    raised_by_user_id uuid REFERENCES users(id), resolved_at timestamptz, resolution text, reminded_at timestamptz
);

-- ============ M40 Visitor & Security ============
CREATE TABLE watchlist_entries (__SYS__
    name text NOT NULL, id_number text, reason text NOT NULL, severity text NOT NULL DEFAULT 'high',
    active boolean NOT NULL DEFAULT true
);
CREATE TABLE visitors (__SYS__
    name text NOT NULL, phone text, id_type text, id_number text
);
CREATE TABLE visitor_passes (__SYS__
    pass_no text NOT NULL UNIQUE, visitor_id uuid NOT NULL REFERENCES visitors(id),
    host_staff_id uuid REFERENCES staff(id), host_user_id uuid REFERENCES users(id), purpose text NOT NULL,
    expected_at timestamptz, checked_in_at timestamptz, checked_out_at timestamptz,
    status text NOT NULL DEFAULT 'pre_registered'
        CHECK (status IN ('pre_registered','checked_in','checked_out','blocked','cancelled')),
    watchlist_entry_id uuid REFERENCES watchlist_entries(id), override_by uuid, override_reason text, badge_no text
);
CREATE TABLE vehicle_logs (__SYS__
    reg_no text NOT NULL, driver_name text, purpose text, entered_at timestamptz NOT NULL DEFAULT now(),
    exited_at timestamptz, registered boolean NOT NULL DEFAULT true, logged_by uuid
);
CREATE TABLE patrol_logs (__SYS__
    guard_user_id uuid REFERENCES users(id), checkpoint text NOT NULL, notes text,
    logged_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE security_incidents (__SYS__
    kind text NOT NULL CHECK (kind IN ('panic','incident','drill')), title text NOT NULL, description text,
    location text, severity text NOT NULL DEFAULT 'WARNING',
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    raised_by_user_id uuid REFERENCES users(id), resolved_at timestamptz, resolution text
);

-- ============ M22 Wellbeing ============
CREATE TABLE discipline_incidents (__SYS__
    incident_no text NOT NULL UNIQUE, student_id uuid NOT NULL REFERENCES students(id), occurred_on date NOT NULL,
    category text NOT NULL, severity text NOT NULL CHECK (severity IN ('low','medium','high','severe')),
    summary text NOT NULL, details text, reported_by_user_id uuid REFERENCES users(id),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','closed')), resolution text
);
CREATE TABLE counselling_sessions (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), counsellor_user_id uuid REFERENCES users(id),
    scheduled_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
    notes_enc text, intervention_plan text
);
CREATE TABLE wellbeing_watchlist (__SYS__
    student_id uuid NOT NULL REFERENCES students(id), reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','active','pending_removal','removed','rejected')),
    added_at timestamptz, removed_at timestamptz, workflow_instance_id uuid
);

-- ============ M24 Accreditation ============
CREATE TABLE accreditation_frameworks (__SYS__
    code text NOT NULL UNIQUE, name text NOT NULL, cycle text
);
CREATE TABLE accreditation_criteria (__SYS__
    framework_id uuid NOT NULL REFERENCES accreditation_frameworks(id), code text NOT NULL, title text NOT NULL,
    weight numeric(5,2) NOT NULL DEFAULT 0, target_evidence integer NOT NULL DEFAULT 5
);
CREATE TABLE evidence_items (__SYS__
    criterion_id uuid NOT NULL REFERENCES accreditation_criteria(id), title text NOT NULL, description text,
    file_id uuid REFERENCES files(id),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','mapped','verified')),
    owner_user_id uuid REFERENCES users(id)
);
CREATE TABLE submission_packs (__SYS__
    framework_id uuid NOT NULL REFERENCES accreditation_frameworks(id), cycle text NOT NULL, notes text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','filed')),
    filed_at timestamptz, workflow_instance_id uuid
);
CREATE TABLE policy_documents (__SYS__
    code text NOT NULL, title text NOT NULL, version_label text NOT NULL, body text NOT NULL,
    published_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true,
    due_days integer NOT NULL DEFAULT 14
);
CREATE TABLE policy_acknowledgements (__SYS__
    policy_id uuid NOT NULL REFERENCES policy_documents(id), user_id uuid NOT NULL REFERENCES users(id),
    acknowledged_at timestamptz NOT NULL DEFAULT now(), UNIQUE (policy_id, user_id)
);

-- ============ M10 / M11 / M12 LMS & Content ============
CREATE TABLE lms_courses (__SYS__
    code text NOT NULL UNIQUE, title text NOT NULL, description text, category text,
    instructor_staff_id uuid REFERENCES staff(id),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','archived')),
    published_at timestamptz, cover_color text
);
CREATE TABLE lms_modules (__SYS__
    course_id uuid NOT NULL REFERENCES lms_courses(id), seq integer NOT NULL, title text NOT NULL
);
CREATE TABLE lms_lessons (__SYS__
    module_id uuid NOT NULL REFERENCES lms_modules(id), seq integer NOT NULL, title text NOT NULL,
    kind text NOT NULL DEFAULT 'reading' CHECK (kind IN ('reading','video')), content text NOT NULL DEFAULT '',
    video_url text, duration_minutes integer NOT NULL DEFAULT 10, content_version integer NOT NULL DEFAULT 1
);
CREATE TABLE lms_enrollments (__SYS__
    course_id uuid NOT NULL REFERENCES lms_courses(id), student_id uuid NOT NULL REFERENCES students(id),
    progress_pct numeric(5,2) NOT NULL DEFAULT 0, completed_at timestamptz, certificate_no text UNIQUE,
    UNIQUE (course_id, student_id)
);
CREATE TABLE lesson_progress (__SYS__
    enrollment_id uuid NOT NULL REFERENCES lms_enrollments(id), lesson_id uuid NOT NULL REFERENCES lms_lessons(id),
    completed_at timestamptz NOT NULL DEFAULT now(), UNIQUE (enrollment_id, lesson_id)
);
CREATE TABLE quizzes (__SYS__
    course_id uuid NOT NULL REFERENCES lms_courses(id), title text NOT NULL,
    time_limit_minutes integer NOT NULL DEFAULT 15, pass_pct numeric(5,2) NOT NULL DEFAULT 60,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published'))
);
CREATE TABLE quiz_questions (__SYS__
    quiz_id uuid NOT NULL REFERENCES quizzes(id), seq integer NOT NULL, text text NOT NULL, options jsonb NOT NULL,
    correct_index integer NOT NULL, marks numeric(5,2) NOT NULL DEFAULT 1
);
CREATE TABLE quiz_attempts (__SYS__
    quiz_id uuid NOT NULL REFERENCES quizzes(id), student_id uuid NOT NULL REFERENCES students(id),
    started_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
    question_order jsonb NOT NULL DEFAULT '[]', answers jsonb NOT NULL DEFAULT '{}',
    score numeric(6,2), max_score numeric(6,2), passed boolean,
    status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
    tab_switches integer NOT NULL DEFAULT 0, flagged boolean NOT NULL DEFAULT false, late boolean NOT NULL DEFAULT false,
    malpractice_status text NOT NULL DEFAULT 'none' CHECK (malpractice_status IN ('none','open','cleared','upheld')),
    malpractice_note text
);
CREATE TABLE content_items (__SYS__
    title text NOT NULL, kind text NOT NULL DEFAULT 'lesson' CHECK (kind IN ('lesson','slides','media','template')),
    body text NOT NULL DEFAULT '', media_url text, author_user_id uuid REFERENCES users(id),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','archived','discarded')),
    published_version integer NOT NULL DEFAULT 0, review_comment text, tags jsonb NOT NULL DEFAULT '[]'
);

-- ============ Catalogued modules (generic workspace) ============
CREATE TABLE module_records (__SYS__
    module_code text NOT NULL, name text NOT NULL, reference_code text, scope text, category text,
    status text NOT NULL DEFAULT 'active', tags jsonb NOT NULL DEFAULT '[]', notes text, amount numeric(14,2),
    owner_user_id uuid REFERENCES users(id)
);
CREATE TABLE module_activity (__SYS__
    module_code text NOT NULL, record_id uuid REFERENCES module_records(id), title text NOT NULL,
    status text NOT NULL DEFAULT 'completed', actor_name text, occurred_at timestamptz NOT NULL DEFAULT now()
);
"""

INDEXES_SQL = """
CREATE UNIQUE INDEX ux_attendance_session_slot ON attendance_sessions (section_id, session_date, slot_id) WHERE slot_id IS NOT NULL;
CREATE UNIQUE INDEX ux_attendance_session_adhoc ON attendance_sessions (section_id, session_date) WHERE slot_id IS NULL;
CREATE UNIQUE INDEX ux_payroll_regular_period ON payroll_runs (period) WHERE run_type = 'regular' AND deleted_at IS NULL;
CREATE UNIQUE INDEX ux_allotment_bed ON room_allotments (room_id, bed_no) WHERE status = 'active';
CREATE UNIQUE INDEX ux_allotment_student ON room_allotments (student_id) WHERE status = 'active';
CREATE UNIQUE INDEX ux_transport_alloc_student ON transport_allocations (student_id) WHERE status = 'active';
CREATE INDEX ix_audit_entity ON audit_log (entity_type, entity_id);
CREATE INDEX ix_audit_created ON audit_log (created_at DESC);
CREATE INDEX ix_audit_event ON audit_log (event_code);
CREATE INDEX ix_notifications_user ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX ix_notifications_throttle ON notifications (throttle_key, user_id, created_at);
CREATE INDEX ix_enrollments_student ON enrollments (student_id);
CREATE INDEX ix_att_records_student ON attendance_records (student_id);
CREATE INDEX ix_att_sessions_section_date ON attendance_sessions (section_id, session_date);
CREATE INDEX ix_marks_student ON marks (student_id);
CREATE INDEX ix_invoices_student ON invoices (student_id, status);
CREATE INDEX ix_payments_invoice ON payments (invoice_id);
CREATE INDEX ix_links_student ON guardian_student_links (student_id);
CREATE INDEX ix_links_guardian ON guardian_student_links (guardian_id);
CREATE INDEX ix_wf_instances_status ON workflow_instances (status, type);
CREATE INDEX ix_wf_steps_instance ON workflow_steps (instance_id);
CREATE INDEX ix_loans_borrower ON library_loans (borrower_user_id, status);
CREATE INDEX ix_module_records_code ON module_records (module_code);
CREATE INDEX ix_sessions_user ON sessions (user_id);
CREATE INDEX ix_slots_section ON timetable_slots (section_id);
CREATE INDEX ix_wallet_txn_wallet ON wallet_transactions (wallet_id, created_at);
"""

# Tables where the app role may hard-delete rows (draft/ephemeral join data only)
DELETABLE_TABLES = ["notification_preferences", "timetable_slots", "fee_structure_items", "quiz_questions",
                    "invigilator_duties", "chat_participants"]


async def apply_master_schema(conn) -> None:
    await conn.execute(MASTER_SQL)


async def apply_tenant_schema(conn) -> None:
    await conn.execute(FUNCTIONS_SQL)
    await conn.execute(TENANT_TABLES_SQL.replace("__SYS__", SYS))
    await conn.execute(INDEXES_SQL)
    tenant_tables = [r["table_name"] for r in await conn.fetch(
        """SELECT DISTINCT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'tenant_id' ORDER BY table_name""")]
    versioned = [r["table_name"] for r in await conn.fetch(
        """SELECT DISTINCT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'version' ORDER BY table_name""")]
    statements = []
    for table in versioned:
        statements.append(f"CREATE TRIGGER trg_touch_{table} BEFORE UPDATE ON {table} "
                          f"FOR EACH ROW EXECUTE FUNCTION touch_row();")
    for table in tenant_tables:
        statements.append(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        statements.append(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (tenant_id = current_setting('app.tenant_id')::uuid) "
            f"WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);")
    statements += [
        "CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log "
        "FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();",
        f"GRANT USAGE ON SCHEMA public TO {APP_DB_USER};",
        f"GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO {APP_DB_USER};",
        f"REVOKE UPDATE ON audit_log FROM {APP_DB_USER};",
        f"GRANT DELETE ON {', '.join(DELETABLE_TABLES)} TO {APP_DB_USER};",
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_DB_USER};",
    ]
    await conn.execute("\n".join(statements))
