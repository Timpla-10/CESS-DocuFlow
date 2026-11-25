-- ============================================================================
-- CESS DocuFlow — Pure SQL for DrawSQL Importer (drawsql.app/sql-to-erd)
-- ENUMs converted to standard VARCHAR to ensure clean parsing by DrawSQL.
-- All constraints, Foreign Keys, Primary Keys, and Indexes preserved.
-- ============================================================================

CREATE TABLE "User" (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    department_or_office VARCHAR(150),
    account_status VARCHAR(50) NOT NULL DEFAULT 'Active',
    is_whitelisted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Role (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE User_Role (
    user_id UUID REFERENCES "User"(user_id) ON DELETE CASCADE,
    role_id INT REFERENCES Role(role_id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE Office (
    office_id SERIAL PRIMARY KEY,
    office_name VARCHAR(150) UNIQUE NOT NULL,
    office_type VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE User_Office (
    user_id UUID REFERENCES "User"(user_id) ON DELETE CASCADE,
    office_id INT REFERENCES Office(office_id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, office_id)
);

CREATE TABLE Document_Type (
    doc_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(200) NOT NULL,
    origin VARCHAR(20) NOT NULL,
    standard_processing_days INT NOT NULL CHECK (standard_processing_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Required_Form (
    form_id SERIAL PRIMARY KEY,
    doc_type_id INT REFERENCES Document_Type(doc_type_id) ON DELETE CASCADE,
    form_name VARCHAR(200) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    template_url VARCHAR(500),
    source_office VARCHAR(150)
);

CREATE TABLE Document_Request (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_number VARCHAR(50) UNIQUE NOT NULL,
    current_revision_no INT NOT NULL DEFAULT 1 CHECK (current_revision_no >= 1),
    requester_id UUID REFERENCES "User"(user_id) ON DELETE RESTRICT,
    doc_type_id INT REFERENCES Document_Type(doc_type_id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    origin VARCHAR(20) NOT NULL,
    current_status VARCHAR(50) NOT NULL DEFAULT 'Submitted',
    current_office_id INT REFERENCES Office(office_id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE Document_Attachment (
    attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES Document_Request(document_id) ON DELETE CASCADE,
    form_id INT REFERENCES Required_Form(form_id) ON DELETE SET NULL,
    revision_no INT NOT NULL DEFAULT 1,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size_kb INT CHECK (file_size_kb > 0 AND file_size_kb <= 20480),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Document_History (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES Document_Request(document_id) ON DELETE CASCADE,
    revision_no INT NOT NULL,
    action_by_user_id UUID REFERENCES "User"(user_id) ON DELETE SET NULL,
    action_office_id INT REFERENCES Office(office_id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    action_remarks TEXT,
    action_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Route_Template (
    route_id SERIAL PRIMARY KEY,
    doc_type_id INT REFERENCES Document_Type(doc_type_id) ON DELETE CASCADE,
    origin VARCHAR(20) NOT NULL,
    description TEXT,
    UNIQUE (doc_type_id, origin)
);

CREATE TABLE Route_Step (
    step_id SERIAL PRIMARY KEY,
    route_id INT REFERENCES Route_Template(route_id) ON DELETE CASCADE,
    office_id INT REFERENCES Office(office_id) ON DELETE RESTRICT,
    step_order INT NOT NULL CHECK (step_order > 0),
    is_conditional BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (route_id, step_order)
);

CREATE TABLE Notification_Preference (
    pref_id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES "User"(user_id) ON DELETE CASCADE,
    receive_email BOOLEAN NOT NULL DEFAULT TRUE,
    receive_in_system BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Notification_Log (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES "User"(user_id) ON DELETE CASCADE,
    document_id UUID REFERENCES Document_Request(document_id) ON DELETE SET NULL,
    notification_type VARCHAR(50) NOT NULL,
    delivery_method VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Faculty_Profile (
    profile_id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES "User"(user_id) ON DELETE CASCADE,
    biography TEXT,
    display_picture_url VARCHAR(500),
    consultation_hours VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Subject (
    subject_id SERIAL PRIMARY KEY,
    subject_code VARCHAR(50) UNIQUE NOT NULL,
    subject_name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Syllabus (
    syllabus_id SERIAL PRIMARY KEY,
    subject_id INT REFERENCES Subject(subject_id) ON DELETE CASCADE,
    faculty_id INT REFERENCES Faculty_Profile(profile_id) ON DELETE CASCADE,
    academic_year VARCHAR(20) NOT NULL DEFAULT '2025-2026',
    semester VARCHAR(20) NOT NULL DEFAULT '1st Semester',
    file_url VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE Announcement (
    announcement_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    published_by UUID REFERENCES "User"(user_id) ON DELETE SET NULL,
    target_audience VARCHAR(50) NOT NULL DEFAULT 'All',
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_doc_submitted_at ON Document_Request(submitted_at ASC);
CREATE INDEX idx_doc_status ON Document_Request(current_status);
CREATE INDEX idx_doc_current_office ON Document_Request(current_office_id);
CREATE INDEX idx_doc_requester ON Document_Request(requester_id);
CREATE INDEX idx_history_document ON Document_History(document_id, action_timestamp ASC);
CREATE INDEX idx_notif_recipient ON Notification_Log(recipient_id);
