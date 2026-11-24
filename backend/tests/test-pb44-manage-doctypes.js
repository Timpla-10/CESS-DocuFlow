/**
 * Automated Integration Test Suite for Ticket PB-44:
 * "Manage document types, requirements, and templates [P0]"
 * Traceability: SRS 3.3 REQ-REQT-1, REQ-REQT-2, REQ-REQT-7, REQ-REQT-8, REQ-REQT-9, REQ-REQT-10
 */
const assert = require('assert');
const app = require('../server');
const supabase = require('../config/database');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');
const DocumentModel = require('../models/documentModel');
const DocumentTypeModel = require('../models/documentTypeModel');

const TEST_USERS = {
  secretary: {
    idNumber: 'SEC-2026-PB44',
    name: 'Ms. Carmela Ortiz (Secretary)',
    email: 'secretary.pb44@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
  student: {
    idNumber: 'STU-2026-PB44',
    name: 'Maria Santos (Student)',
    email: 'student.pb44@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English',
    position: 'Student',
  },
  faculty: {
    idNumber: 'FAC-2026-PB44',
    name: 'Prof. Ana Lim (Faculty)',
    email: 'faculty.pb44@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Secondary Education',
    position: 'Assistant Professor',
  },
  chairperson: {
    idNumber: 'CHR-2026-PB44',
    name: 'Dr. Liza Fernandez (Chairperson)',
    email: 'chair.pb44@msunaawan.edu.ph',
    role: 'chairperson',
    origin: 'CESS',
    department: 'Secondary Education',
    position: 'Department Chairperson',
  },
  dean: {
    idNumber: 'DEN-2026-PB44',
    name: 'Dr. Roberto Gomez (Dean)',
    email: 'dean.pb44@msunaawan.edu.ph',
    role: 'dean',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Dean',
  },
};

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PB-44 INTEGRATION TESTS: MANAGE DOCUMENT TYPES & TEMPLATES');
  console.log('================================================================\n');

  // 1. Provision test accounts
  for (const [key, user] of Object.entries(TEST_USERS)) {
    const { primary } = getPasswordsForRole(user.role, user.origin, user.email);
    await provisionVerifiedUser({
      idNumber: user.idNumber,
      email: user.email,
      password: primary,
      name: user.name,
      role: user.role,
      origin: user.origin,
      department: user.department,
      position: user.position,
    });
  }
  console.log('✅ Verified test accounts provisioned in Supabase.');

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}/api`;

  const secHeaders = { 'x-user-email': TEST_USERS.secretary.email };
  const stuHeaders = { 'x-user-email': TEST_USERS.student.email };
  const facHeaders = { 'x-user-email': TEST_USERS.faculty.email };
  const chrHeaders = { 'x-user-email': TEST_USERS.chairperson.email };
  const denHeaders = { 'x-user-email': TEST_USERS.dean.email };

  let createdDocTypeId = null;
  let createdDocumentId = null;
  let addedRequirementId = null;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Admin (College Secretary) creates a new document type (REQ-REQT-1)
    // -------------------------------------------------------------------------
    console.log('\n1️⃣  Testing Admin Creates New Document Type (POST /api/documents/types)...');

    const newTypePayload = {
      type_name: 'Certificate of Good Moral Character (PB44 Test)',
      origin: 'CESS',
      audience: 'student',
      standard_processing_days: 3,
      description: 'Official certification of student conduct issued by CESS Dean Office.',
      template_url: '/templates/Good_Moral_Template_v1.pdf',
      requirements: [
        {
          form_name: 'Good Moral Request Form',
          is_required: true,
          source_office: 'College Secretary',
          template_url: '/templates/Good_Moral_Template_v1.pdf',
        },
        {
          form_name: 'Clearance from Student Affairs',
          is_required: true,
          source_office: 'Office of Student Affairs',
          template_url: null,
        },
        {
          form_name: 'Official Assessment Receipt Copy',
          is_required: false,
          source_office: 'Cashier / Accounting',
          template_url: null,
        },
      ],
    };

    const createRes = await request('/documents/types', {
      method: 'POST',
      headers: secHeaders,
      body: newTypePayload,
    });

    assert.strictEqual(createRes.status, 201, `Expected 201 Created, got ${createRes.status}: ${JSON.stringify(createRes.body)}`);
    assert(createRes.body.documentType, 'Expected documentType in response body');
    createdDocTypeId = createRes.body.documentType.doc_type_id || createRes.body.documentType.id;
    assert(createdDocTypeId, 'Expected generated numeric doc_type_id');

    console.log(`   ✅ Document type created: '${createRes.body.documentType.name}' (ID: ${createdDocTypeId})`);
    console.log(`   ✅ Origin: ${createRes.body.documentType.origin}, Audience: ${createRes.body.documentType.audience}, SLA: ${createRes.body.documentType.standard_processing_days} days`);
    console.log(`   ✅ Initial Requirements configured: ${createRes.body.documentType.requirements?.length} items`);
    assert.strictEqual(createRes.body.documentType.is_active, true, 'New document type must be active by default');
    assert.strictEqual(createRes.body.documentType.requirements.length, 3, 'Must have 3 initial requirements');

    // -------------------------------------------------------------------------
    // TEST 2: Admin updates document type details (REQ-REQT-1, REQ-WFM-7)
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Admin Updates Document Type (PUT /api/documents/types/:id)...');

    const updateRes = await request(`/documents/types/${createdDocTypeId}`, {
      method: 'PUT',
      headers: secHeaders,
      body: {
        standard_processing_days: 5,
        description: 'Expedited certification of student conduct issued by CESS Dean Office.',
      },
    });

    assert.strictEqual(updateRes.status, 200, `Expected 200 OK, got ${updateRes.status}: ${JSON.stringify(updateRes.body)}`);
    assert.strictEqual(updateRes.body.documentType.standard_processing_days, 5, 'Turnaround SLA should be updated to 5 days');
    console.log(`   ✅ Document type SLA updated to 5 days: ${updateRes.body.documentType.standard_processing_days} days`);
    console.log(`   ✅ Description updated: "${updateRes.body.documentType.description}"`);

    // -------------------------------------------------------------------------
    // TEST 3: Admin manages requirements checklist & source offices (REQ-REQT-1, REQ-REQT-7)
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Requirements Checklist & Source Office Management (REQ-REQT-1, REQ-REQT-7)...');

    // Add a requirement
    const addReqRes = await request(`/documents/types/${createdDocTypeId}/requirements`, {
      method: 'POST',
      headers: secHeaders,
      body: {
        form_name: 'Barangay Clearance Copy',
        is_required: false,
        source_office: 'Local Barangay Hall',
      },
    });
    assert.strictEqual(addReqRes.status, 201, 'Expected 201 for adding requirement');
    addedRequirementId = addReqRes.body.requirement.id || addReqRes.body.requirement.form_id;
    console.log(`   ✅ Added optional requirement: '${addReqRes.body.requirement.form_name}' (Source: ${addReqRes.body.requirement.source_office})`);

    // Update requirement (change source office and make required)
    const updateReqRes = await request(`/documents/types/${createdDocTypeId}/requirements/${addedRequirementId}`, {
      method: 'PUT',
      headers: secHeaders,
      body: {
        source_office: 'Dean Office Validation Desk',
        is_required: true,
      },
    });
    assert.strictEqual(updateReqRes.status, 200, 'Expected 200 for updating requirement');
    assert.strictEqual(updateReqRes.body.requirement.source_office, 'Dean Office Validation Desk');
    assert.strictEqual(updateReqRes.body.requirement.is_required, true);
    console.log(`   ✅ Updated requirement source to '${updateReqRes.body.requirement.source_office}' and marked REQUIRED.`);

    // Delete requirement
    const deleteReqRes = await request(`/documents/types/${createdDocTypeId}/requirements/${addedRequirementId}`, {
      method: 'DELETE',
      headers: secHeaders,
    });
    assert.strictEqual(deleteReqRes.status, 200, 'Expected 200 for removing requirement');
    console.log(`   ✅ Removed temporary requirement successfully.`);

    // -------------------------------------------------------------------------
    // TEST 4: Admin replaces template and Requester retrieves it (REQ-REQT-9, REQ-REQT-10)
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Blank Form Template Replacement & Retrieval (REQ-REQT-9, REQ-REQT-10)...');

    const newTemplateUrl = '/templates/Good_Moral_Template_v2_Official.pdf';
    const replaceTemplateRes = await request(`/documents/types/${createdDocTypeId}/template`, {
      method: 'PUT',
      headers: secHeaders,
      body: {
        template_url: newTemplateUrl,
      },
    });
    assert.strictEqual(replaceTemplateRes.status, 200, 'Expected 200 for template update');
    assert.strictEqual(replaceTemplateRes.body.documentType.template_url, newTemplateUrl);
    console.log(`   ✅ Secretary updated official template URL to: ${newTemplateUrl}`);

    // Requester retrieves template URL
    const studentTemplateRes = await request(`/documents/types/${createdDocTypeId}/template`, {
      headers: stuHeaders,
    });
    assert.strictEqual(studentTemplateRes.status, 200, 'Expected 200 for template retrieval');
    assert.strictEqual(studentTemplateRes.body.templateUrl, newTemplateUrl);
    console.log(`   ✅ Student successfully retrieved blank template: ${studentTemplateRes.body.templateUrl}`);

    // -------------------------------------------------------------------------
    // TEST 5: Student submits a valid document request under this new type
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Requester Submits Request under New Document Type...');

    const submitRes = await request('/documents', {
      method: 'POST',
      headers: stuHeaders,
      body: {
        docTypeId: createdDocTypeId,
        title: 'Application for Certificate of Good Moral Character',
        description: 'Applying for scholarship application requirement.',
        origin: 'CESS',
      },
    });

    assert.strictEqual(submitRes.status, 201, `Expected 201 Created, got ${submitRes.status}: ${JSON.stringify(submitRes.body)}`);
    createdDocumentId = submitRes.body.document.document_id || submitRes.body.document.id;
    console.log(`   ✅ Student submitted request: ${submitRes.body.document.control_number} (Doc ID: ${createdDocumentId}, Status: ${submitRes.body.document.status})`);

    // -------------------------------------------------------------------------
    // TEST 6: Admin disables document type & verifies existing requests remain intact
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Testing Soft-Deactivation: Existing Requests Remain Intact...');

    // Secretary deactivates document type
    const deactivateRes = await request(`/documents/types/${createdDocTypeId}`, {
      method: 'DELETE',
      headers: secHeaders,
    });
    assert.strictEqual(deactivateRes.status, 200, 'Expected 200 for deactivation');
    assert.strictEqual(deactivateRes.body.documentType.is_active, false, 'Document type must now be inactive');
    console.log(`   ✅ Secretary deactivated document type: ${deactivateRes.body.documentType.name} (is_active = false)`);

    // Verify it is excluded from student's available types
    const studentTypesRes = await request('/documents/types', { headers: stuHeaders });
    assert.strictEqual(studentTypesRes.status, 200);
    const isPresentInStudentList = studentTypesRes.body.documentTypes.some((t) => t.id === createdDocTypeId);
    assert.strictEqual(isPresentInStudentList, false, 'Inactive document type must NOT appear in student list');
    console.log(`   ✅ Inactive type successfully hidden from requester dropdown.`);

    // Verify submission with inactive document type is blocked (403 Forbidden)
    const blockedSubmitRes = await request('/documents', {
      method: 'POST',
      headers: stuHeaders,
      body: {
        docTypeId: createdDocTypeId,
        title: 'Another application attempt',
        origin: 'CESS',
      },
    });
    assert.strictEqual(blockedSubmitRes.status, 403, 'Submitting inactive doc type must be blocked');
    console.log(`   ✅ New submission under inactive type blocked -> Status 403: "${blockedSubmitRes.body.error}"`);

    // CRITICAL DATA INTEGRITY: Verify existing request is 100% accessible and unaltered
    const existingDocRes = await request(`/documents/${createdDocumentId}`, { headers: stuHeaders });
    assert.strictEqual(existingDocRes.status, 200, 'Existing document must remain accessible');
    assert.strictEqual(existingDocRes.body.document.id, createdDocumentId);
    assert.strictEqual(existingDocRes.body.document.doc_type_id, createdDocTypeId);
    console.log(`   ✅ Data Integrity Verified: Existing request '${existingDocRes.body.document.control_number}' is fully intact and readable.`);

    // -------------------------------------------------------------------------
    // TEST 7: RBAC Guard — Non-admin roles blocked from modifying types or checklists (REQ-REQT-8)
    // -------------------------------------------------------------------------
    console.log('\n7️⃣  Testing RBAC Guard: Non-Admin Roles Forbidden (REQ-REQT-8)...');

    // Student attempts to create document type
    const stuCreateRes = await request('/documents/types', {
      method: 'POST',
      headers: stuHeaders,
      body: newTypePayload,
    });
    assert.strictEqual(stuCreateRes.status, 403, 'Student cannot create document type');
    console.log(`   ✅ Student blocked from creating document type -> 403 Forbidden: "${stuCreateRes.body.error}"`);

    // Faculty attempts to update document type
    const facUpdateRes = await request(`/documents/types/${createdDocTypeId}`, {
      method: 'PUT',
      headers: facHeaders,
      body: { standard_processing_days: 10 },
    });
    assert.strictEqual(facUpdateRes.status, 403, 'Faculty cannot update document type');
    console.log(`   ✅ Faculty blocked from updating document type -> 403 Forbidden: "${facUpdateRes.body.error}"`);

    // Chairperson attempts to delete/disable document type
    const chrDeleteRes = await request(`/documents/types/${createdDocTypeId}`, {
      method: 'DELETE',
      headers: chrHeaders,
    });
    assert.strictEqual(chrDeleteRes.status, 403, 'Chairperson cannot delete document type');
    console.log(`   ✅ Chairperson blocked from deleting document type -> 403 Forbidden: "${chrDeleteRes.body.error}"`);

    // Dean attempts to replace template
    const denTemplateRes = await request(`/documents/types/${createdDocTypeId}/template`, {
      method: 'PUT',
      headers: denHeaders,
      body: { template_url: '/templates/Hacked_Template.pdf' },
    });
    assert.strictEqual(denTemplateRes.status, 403, 'Dean cannot replace official templates');
    console.log(`   ✅ College Dean blocked from replacing templates -> 403 Forbidden: "${denTemplateRes.body.error}"`);

    // Unauthenticated caller attempts modification
    const unauthRes = await request('/documents/types', {
      method: 'POST',
      body: newTypePayload,
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must be rejected');
    console.log(`   ✅ Unauthenticated request blocked -> 401 Unauthorized: "${unauthRes.body.error}"`);

    console.log('\n================================================================');
    console.log('🎉 ALL 7 PB-44 INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    // Clean up created document and created document type
    if (createdDocumentId) {
      await DocumentModel.softDelete(createdDocumentId);
    }
    if (createdDocTypeId) {
      // Clean up required_forms
      await supabase.from('required_form').delete().eq('doc_type_id', createdDocTypeId);
      // Clean up document_type if no foreign key conflict
      await supabase.from('document_type').delete().eq('doc_type_id', createdDocTypeId);
    }
    if (server) {
      server.close();
    }
  }
}

runTests().catch((err) => {
  console.error('❌ PB-44 Test failed:', err);
  process.exit(1);
});
