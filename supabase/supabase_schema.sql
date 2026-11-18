-- ============================================================================
-- CESS DocuFlow — Supabase PostgreSQL Database Schema
-- Based on: CESS DocuFlow SRS & Product Backlog Constraints
-- Features:
--   - Supabase Auth Integration (auth.users foreign key & profile trigger)
--   - Role-Based Access Control (RBAC) with VCAF included
--   - Row Level Security (RLS) policies
--   - File size constraints (20MB limit per PB-14)
--   - Audit trail (Document_History)
--   - Routing templates (CESS vs IDS workflows)
--   - Views for Real-Time Dashboards & Reminders
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUMERATED TYPES (ENUMs)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE user_account_status AS ENUM ('Active', 'Inactive', 'Pending_Verification');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    -- Roles updated per Backlog (PB-02 / SRS 3.1: includes VCAF)
    CREATE TYPE user_role_name AS ENUM (
        'Student',
        'CESS_Faculty',
        'IDS_Faculty',
        'IDS_Principal',
        'Dept_Chairperson',
        'College_Dean',
        'OVCAA',
        'VCAF',
        'Chancellor',
        'College_Secretary_Admin'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE office_type AS ENUM ('Internal_Review', 'External_Office', 'Admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE document_origin AS ENUM ('CESS', 'IDS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    -- Statuses updated per Backlog (PB-20, PB-23, PB-33)
    CREATE TYPE document_status AS ENUM (
        'Submitted',
        'Under_Review',
        'Returned',
        'Rejected',
        'With_External_Office',
        'Ready_for_Release',
        'Released',
        'Archived'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    -- Action types recorded in the immutable audit trail
    CREATE TYPE action_type AS ENUM (
        'Submitted',
        'Content_Verified',
        'Routed',
        'Endorsed',
        'Approved',
        'Returned',
        'Rejected',
        'Sent_External',
        'Returned_External',
        'Ready_for_Release',
        'Released',
        'Archived'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'Status_Update',
        'Reminder_3_Days',
        'Return_Alert',
        'Reject_Alert',
        'Release_Alert',
        'Notice_Minutes_Alert'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE delivery_method AS ENUM ('Email', 'In_System', 'Both');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_status AS ENUM ('Pending', 'Sent', 'Failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. CORE IDENTITY & ROLES (E1: PB-01, PB-02, PB-43)
-- ============================================================================

-- Table 1: User
-- Note: In Supabase, user_id references auth.users(id) for authenticated users.
CREATE TABLE IF NOT EXISTS "User" (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    university_email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    department_or_office VARCHAR(150),
    account_status user_account_status NOT NULL DEFAULT 'Active',
    is_whitelisted BOOLEAN NOT NULL DEFAULT TRUE, -- PB-43 whitelist / admin verification
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_valid_email CHECK (university_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Table 2: Role
CREATE TABLE IF NOT EXISTS Role (
    role_id SERIAL PRIMARY KEY,
    role_name user_role_name UNIQUE NOT NULL
);

-- Table 3: User_Role (Junction Table)
CREATE TABLE IF NOT EXISTS User_Role (
    user_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES Role(role_id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- Table 4: Office
CREATE TABLE IF NOT EXISTS Office (
    office_id SERIAL PRIMARY KEY,
    office_name VARCHAR(150) NOT NULL UNIQUE,
    office_type office_type NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Table 5: User_Office (Junction Table)
CREATE TABLE IF NOT EXISTS User_Office (
    user_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    office_id INT NOT NULL REFERENCES Office(office_id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, office_id)
);

-- ============================================================================
-- 3. DOCUMENT CATALOG & WORKFLOW CONFIGURATION (E2, E5: PB-10, PB-11, PB-12, PB-44)
-- ============================================================================

-- Table 6: Document_Type
CREATE TABLE IF NOT EXISTS Document_Type (
    doc_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(200) NOT NULL,
    origin document_origin NOT NULL,
    standard_processing_days INT NOT NULL CHECK (standard_processing_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 7: Required_Form (Checklist & Templates)
CREATE TABLE IF NOT EXISTS Required_Form (
    form_id SERIAL PRIMARY KEY,
    doc_type_id INT NOT NULL REFERENCES Document_Type(doc_type_id) ON DELETE CASCADE,
    form_name VARCHAR(200) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    template_url VARCHAR(500),
    source_office VARCHAR(150)
);

-- ============================================================================
-- 4. DOCUMENT TRANSACTIONS & SUBMISSION (E2, E3: PB-13 TO PB-19, PB-34)
-- ============================================================================

-- Table 8: Document_Request
CREATE TABLE IF NOT EXISTS Document_Request (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_number VARCHAR(50) UNIQUE NOT NULL,
    current_revision_no INT NOT NULL DEFAULT 1 CHECK (current_revision_no >= 1),
    requester_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE RESTRICT,
    doc_type_id INT NOT NULL REFERENCES Document_Type(doc_type_id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    origin document_origin NOT NULL,
    current_status document_status NOT NULL DEFAULT 'Submitted',
    current_office_id INT REFERENCES Office(office_id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE -- Soft delete / archiving (PB-34)
);

-- Table 9: Document_Attachment (20MB limit constraint per PB-14)
CREATE TABLE IF NOT EXISTS Document_Attachment (
    attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES Document_Request(document_id) ON DELETE CASCADE,
    form_id INT REFERENCES Required_Form(form_id) ON DELETE SET NULL,
    revision_no INT NOT NULL DEFAULT 1 CHECK (revision_no >= 1),
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size_kb INT CHECK (file_size_kb > 0 AND file_size_kb <= 20480), -- Enforcing 20MB limit (PB-14)
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 10: Document_History (Immutable Audit Trail: PB-22, PB-24, PB-48)
CREATE TABLE IF NOT EXISTS Document_History (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES Document_Request(document_id) ON DELETE CASCADE,
    revision_no INT NOT NULL CHECK (revision_no >= 1),
    action_by_user_id UUID REFERENCES "User"(user_id) ON DELETE SET NULL,
    action_office_id INT REFERENCES Office(office_id) ON DELETE SET NULL,
    action_type action_type NOT NULL,
    action_remarks TEXT,
    action_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraint: Return and Reject require remarks/reasons (PB-22, PB-23)
    CONSTRAINT chk_remarks_on_return_reject CHECK (
        (action_type NOT IN ('Returned', 'Rejected')) OR 
        (action_remarks IS NOT NULL AND TRIM(action_remarks) <> '')
    )
);

-- ============================================================================
-- 5. ROUTING & TRANSIT (E3, E5: PB-25, PB-45)
-- ============================================================================

-- Table 11: Route_Template
CREATE TABLE IF NOT EXISTS Route_Template (
    route_id SERIAL PRIMARY KEY,
    doc_type_id INT NOT NULL REFERENCES Document_Type(doc_type_id) ON DELETE CASCADE,
    origin document_origin NOT NULL,
    description TEXT,
    CONSTRAINT uq_doctype_origin UNIQUE (doc_type_id, origin)
);

-- Table 12: Route_Step
CREATE TABLE IF NOT EXISTS Route_Step (
    step_id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES Route_Template(route_id) ON DELETE CASCADE,
    office_id INT NOT NULL REFERENCES Office(office_id) ON DELETE RESTRICT,
    step_order INT NOT NULL CHECK (step_order > 0),
    is_conditional BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_route_step_order UNIQUE (route_id, step_order)
);

-- ============================================================================
-- 6. NOTIFICATION SYSTEM (E4: PB-05, PB-06, PB-30, PB-42)
-- ============================================================================

-- Table 13: Notification_Preference
CREATE TABLE IF NOT EXISTS Notification_Preference (
    pref_id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    receive_email BOOLEAN NOT NULL DEFAULT TRUE,
    receive_in_system BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 14: Notification_Log
CREATE TABLE IF NOT EXISTS Notification_Log (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    document_id UUID REFERENCES Document_Request(document_id) ON DELETE SET NULL,
    notification_type notification_type NOT NULL,
    delivery_method delivery_method NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    status notification_status NOT NULL DEFAULT 'Pending',
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. COLLEGE DIRECTORY & SYLLABI (E4, E5: PB-38, PB-39, PB-40, PB-41)
-- ============================================================================

-- Table 15: Faculty_Profile
CREATE TABLE IF NOT EXISTS Faculty_Profile (
    profile_id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    biography TEXT,
    display_picture_url VARCHAR(500),
    consultation_hours VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 16: Subject
CREATE TABLE IF NOT EXISTS Subject (
    subject_id SERIAL PRIMARY KEY,
    subject_code VARCHAR(50) UNIQUE NOT NULL,
    subject_name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 17: Syllabus
CREATE TABLE IF NOT EXISTS Syllabus (
    syllabus_id SERIAL PRIMARY KEY,
    subject_id INT NOT NULL REFERENCES Subject(subject_id) ON DELETE CASCADE,
    faculty_id INT NOT NULL REFERENCES Faculty_Profile(profile_id) ON DELETE CASCADE,
    academic_year VARCHAR(20) NOT NULL DEFAULT '2025-2026',
    semester VARCHAR(20) NOT NULL DEFAULT '1st Semester',
    file_url VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_subject_faculty_term UNIQUE (subject_id, faculty_id, academic_year, semester)
);

-- Table 18: Announcements / Notices (PB-41)
CREATE TABLE IF NOT EXISTS Announcement (
    announcement_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    published_by UUID REFERENCES "User"(user_id) ON DELETE SET NULL,
    target_audience VARCHAR(50) NOT NULL DEFAULT 'All', -- All, Student, Faculty
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. INDEXES FOR PERFORMANCE & ORDERING (PB-29, PB-30, PB-36)
-- ============================================================================

-- FCFS Queue Ordering (PB-29: Oldest eligible request first)
CREATE INDEX IF NOT EXISTS idx_doc_submitted_at ON Document_Request(submitted_at ASC);

-- Dashboard & Status filtering
CREATE INDEX IF NOT EXISTS idx_doc_status ON Document_Request(current_status);
CREATE INDEX IF NOT EXISTS idx_doc_current_office ON Document_Request(current_office_id);
CREATE INDEX IF NOT EXISTS idx_doc_requester ON Document_Request(requester_id);
CREATE INDEX IF NOT EXISTS idx_doc_origin ON Document_Request(origin);

-- Audit timeline lookup
CREATE INDEX IF NOT EXISTS idx_history_document ON Document_History(document_id, action_timestamp ASC);

-- Notifications lookup
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON Notification_Log(recipient_id, is_read, created_at DESC);

-- ============================================================================
-- 9. TRIGGERS & AUTOMATION
-- ============================================================================

-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_updated_at ON "User";
CREATE TRIGGER trg_user_updated_at
BEFORE UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_doc_request_updated_at ON Document_Request;
CREATE TRIGGER trg_doc_request_updated_at
BEFORE UPDATE ON Document_Request
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- Auto create Notification_Preference and Profile when a new user is created in "User"
CREATE OR REPLACE FUNCTION handle_new_user_setup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO Notification_Preference (user_id, receive_email, receive_in_system)
    VALUES (NEW.user_id, TRUE, TRUE)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_new_user_setup ON "User";
CREATE TRIGGER trg_new_user_setup
AFTER INSERT ON "User"
FOR EACH ROW EXECUTE FUNCTION handle_new_user_setup();

-- Prevent modification of document history (Immutable Audit Trail: PB-48)
CREATE OR REPLACE FUNCTION prevent_audit_trail_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit trail records in Document_History are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_trail_immutable ON Document_History;
CREATE TRIGGER trg_audit_trail_immutable
BEFORE UPDATE OR DELETE ON Document_History
FOR EACH ROW EXECUTE FUNCTION prevent_audit_trail_tampering();

-- ============================================================================
-- 10. DASHBOARD VIEWS (E4: PB-07, PB-08, PB-28, PB-30)
-- ============================================================================

-- 1. Status & Office Summary View (PB-28)
CREATE OR REPLACE VIEW vw_dashboard_summary AS
SELECT 
    COALESCE(o.office_name, 'No Office Assigned') AS office_name,
    dr.current_status,
    COUNT(dr.document_id) AS document_count
FROM Document_Request dr
LEFT JOIN Office o ON dr.current_office_id = o.office_id
WHERE dr.is_deleted = FALSE
GROUP BY o.office_name, dr.current_status;

-- 2. Aging / Overdue Documents View (PB-30: 3-day and SLA tracking)
CREATE OR REPLACE VIEW vw_delayed_documents AS
SELECT 
    dr.document_id,
    dr.control_number,
    dt.type_name,
    dr.origin,
    COALESCE(o.office_name, 'Unassigned') AS current_office,
    dr.last_updated_at,
    dt.standard_processing_days,
    EXTRACT(DAY FROM (NOW() - dr.last_updated_at))::INT AS days_waiting,
    CASE 
        WHEN EXTRACT(DAY FROM (NOW() - dr.last_updated_at)) > dt.standard_processing_days THEN TRUE 
        ELSE FALSE 
    END AS is_overdue
FROM Document_Request dr
JOIN Document_Type dt ON dr.doc_type_id = dt.doc_type_id
LEFT JOIN Office o ON dr.current_office_id = o.office_id
WHERE dr.is_deleted = FALSE
  AND dr.current_status NOT IN ('Released', 'Archived', 'Rejected');

-- 3. Requester Progress Monitoring View (PB-08, PB-32)
CREATE OR REPLACE VIEW vw_my_documents AS
SELECT 
    dr.document_id,
    dr.control_number,
    dr.title,
    dt.type_name,
    dr.origin,
    dr.submitted_at,
    dr.current_status,
    dr.current_revision_no,
    COALESCE(o.office_name, 'Processing') AS current_office,
    dr.requester_id
FROM Document_Request dr
JOIN Document_Type dt ON dr.doc_type_id = dt.doc_type_id
LEFT JOIN Office o ON dr.current_office_id = o.office_id
WHERE dr.is_deleted = FALSE;

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES (PB-02, PB-49)
-- ============================================================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE Document_Request ENABLE ROW LEVEL SECURITY;
ALTER TABLE Document_Attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE Document_History ENABLE ROW LEVEL SECURITY;
ALTER TABLE Notification_Log ENABLE ROW LEVEL SECURITY;
ALTER TABLE Notification_Preference ENABLE ROW LEVEL SECURITY;

-- Helper Function to check if authenticated user is College Secretary / Admin
CREATE OR REPLACE FUNCTION is_secretary_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM User_Role ur
        JOIN Role r ON ur.role_id = r.role_id
        WHERE ur.user_id = auth.uid()
          AND r.role_name = 'College_Secretary_Admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: "User"
CREATE POLICY "Users can view own profile" 
ON "User" FOR SELECT 
USING (user_id = auth.uid() OR is_secretary_admin());

CREATE POLICY "Users can update own profile" 
ON "User" FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Secretary can manage all users" 
ON "User" FOR ALL 
USING (is_secretary_admin());

-- RLS: Document_Request
-- Requesters can see their own documents
CREATE POLICY "Requesters see own documents" 
ON Document_Request FOR SELECT 
USING (requester_id = auth.uid());

-- Requesters can insert documents
CREATE POLICY "Requesters can create documents" 
ON Document_Request FOR INSERT 
WITH CHECK (requester_id = auth.uid());

-- Requesters can update their own document only if Returned for Revision (PB-18, PB-19)
CREATE POLICY "Requesters can update returned documents" 
ON Document_Request FOR UPDATE 
USING (
    requester_id = auth.uid() 
    AND current_status = 'Returned'
);

-- Reviewing Offices can view documents routed to their office (PB-27)
CREATE POLICY "Reviewers see documents routed to their office" 
ON Document_Request FOR SELECT 
USING (
    current_office_id IN (
        SELECT office_id FROM User_Office WHERE user_id = auth.uid()
    )
);

-- Secretary sees and manages all documents (PB-20)
CREATE POLICY "Secretary has full access to documents" 
ON Document_Request FOR ALL 
USING (is_secretary_admin());

-- RLS: Document_Attachment (PB-37)
CREATE POLICY "View attachments if document is accessible" 
ON Document_Attachment FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM Document_Request dr 
        WHERE dr.document_id = Document_Attachment.document_id
          AND (
              dr.requester_id = auth.uid()
              OR is_secretary_admin()
              OR dr.current_office_id IN (SELECT office_id FROM User_Office WHERE user_id = auth.uid())
          )
    )
);

CREATE POLICY "Requesters can upload attachments" 
ON Document_Attachment FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM Document_Request dr 
        WHERE dr.document_id = Document_Attachment.document_id
          AND dr.requester_id = auth.uid()
    )
);

-- RLS: Document_History (PB-26: Read-only to authorized participants)
CREATE POLICY "View history if authorized" 
ON Document_History FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM Document_Request dr 
        WHERE dr.document_id = Document_History.document_id
          AND (
              dr.requester_id = auth.uid()
              OR is_secretary_admin()
              OR dr.current_office_id IN (SELECT office_id FROM User_Office WHERE user_id = auth.uid())
          )
    )
);

CREATE POLICY "Authorized actors insert history records" 
ON Document_History FOR INSERT 
WITH CHECK (action_by_user_id = auth.uid() OR is_secretary_admin());

-- RLS: Notification_Log (PB-06)
CREATE POLICY "Users can only see own notifications" 
ON Notification_Log FOR SELECT 
USING (recipient_id = auth.uid());

CREATE POLICY "Users can mark own notifications read" 
ON Notification_Log FOR UPDATE 
USING (recipient_id = auth.uid());

-- RLS: Notification_Preference (PB-05)
CREATE POLICY "Users can manage own preferences" 
ON Notification_Preference FOR ALL 
USING (user_id = auth.uid());

-- ============================================================================
-- 12. SEED DATA (BASELINE CONFIGURATION)
-- ============================================================================

-- Roles (PB-02: Complete list including VCAF)
INSERT INTO Role (role_name) VALUES 
    ('Student'),
    ('CESS_Faculty'),
    ('IDS_Faculty'),
    ('IDS_Principal'),
    ('Dept_Chairperson'),
    ('College_Dean'),
    ('OVCAA'),
    ('VCAF'),
    ('Chancellor'),
    ('College_Secretary_Admin')
ON CONFLICT (role_name) DO NOTHING;

-- Offices (PB-02, PB-31: Internal, External, and Admin)
INSERT INTO Office (office_name, office_type) VALUES 
    ('College Secretary', 'Admin'),
    ('Department Chairperson', 'Internal_Review'),
    ('IDS Principal', 'Internal_Review'),
    ('College Dean', 'Internal_Review'),
    ('OVCAA', 'Internal_Review'),
    ('VCAF', 'Internal_Review'),
    ('Office of the Chancellor', 'Internal_Review'),
    ('HRMO', 'External_Office'),
    ('Registrar', 'External_Office'),
    ('Budget and Accounting', 'External_Office')
ON CONFLICT (office_name) DO NOTHING;

-- Initial Document Types
INSERT INTO Document_Type (type_name, origin, standard_processing_days) VALUES 
    ('Completion of Incomplete Grade (INC)', 'CESS', 3),
    ('Adding/Dropping/Changing of Subject', 'CESS', 3),
    ('Application for Graduation', 'CESS', 5),
    ('Faculty Leave Recommendation Form', 'CESS', 4),
    ('IDS Travel Order Request', 'IDS', 4),
    ('IDS Student Clearance', 'IDS', 3)
ON CONFLICT DO NOTHING;
