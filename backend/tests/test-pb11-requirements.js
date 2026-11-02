/**
 * Integration Test Suite for Ticket PB-11:
 * "Show required forms, attachments, and source office [P0]"
 * Traceability: SRS 3.3 REQ-REQT-1, REQ-REQT-2, REQ-REQT-7, REQ-REQT-8
 */
const app = require('../server');
const DocumentTypeModel = require('../models/documentTypeModel');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');

const TEST_USERS = [
  {
    idNumber: '2023-0142',
    name: 'Maria Santos',
    email: 'student@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English, 3rd Year',
    position: 'Student',
  },
  {
    idNumber: 'EMP-2019-011',
    name: 'Prof. Ana Lim',
    email: 'faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Assistant Professor',
  },
  {
    idNumber: 'SEC-2026-01',
    name: 'Ms. Carmela Ortiz',
    email: 'secretary@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
];

async function seedTestUsers() {
  for (const u of TEST_USERS) {
    const { primary } = getPasswordsForRole(u.role, u.origin, u.email);
    await provisionVerifiedUser({
      idNumber: u.idNumber,
      email: u.email,
      password: primary,
      name: u.name,
      role: u.role,
      origin: u.origin,
      department: u.department,
      position: u.position,
    });
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PB-11 INTEGRATION TESTS: REQUIREMENTS & SOURCE OFFICE');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  try {
    const request = async (path, options = {}) => {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, body: data };
    };

    const studentHeaders = { 'x-user-email': 'student@msunaawan.edu.ph' };
    const facultyHeaders = { 'x-user-email': 'faculty@msunaawan.edu.ph' };
    const secretaryHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };

    // -------------------------------------------------------------------------
    // TEST 1: Fetch Requirements for Document Type 1 (Completion of INC)
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Fetch Checklist for Document Type 1 (INC Form)...');
    const incRes = await request('/document-types/1/requirements', { headers: studentHeaders });
    if (incRes.status !== 200) {
      throw new Error(`GET /document-types/1/requirements failed: ${incRes.status} ${JSON.stringify(incRes.body)}`);
    }

    const { count, requirements } = incRes.body;
    if (!Array.isArray(requirements) || requirements.length < 3) {
      throw new Error(`Expected at least 3 checklist items for INC, received: ${count}`);
    }

    console.log(`   ✅ Received ${count} requirements for INC:`);
    for (const r of requirements) {
      console.log(`      - [${r.required ? 'REQUIRED' : 'OPTIONAL'}] ${r.form_name} (Source: ${r.source_office})`);
      if (!r.form_name || !r.source_office) {
        throw new Error(`Missing form_name or source_office on requirement: ${JSON.stringify(r)}`);
      }
    }

    // Assert that template_url is present for the official form
    const mainForm = requirements.find((r) => r.form_name.includes('Official INC Completion Form'));
    if (!mainForm || !mainForm.template_url) {
      throw new Error('Official INC Completion Form missing expected template_url');
    }
    console.log(`   ✅ Template URL verified: ${mainForm.template_url}`);

    // -------------------------------------------------------------------------
    // TEST 2: Universal Source Office Verification across all 6 Document Types
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Source Office Guidance across all 6 Document Types (REQ-REQT-7)...');
    for (let id = 1; id <= 6; id++) {
      const typeRes = await request(`/document-types/${id}/requirements`, { headers: studentHeaders });
      if (typeRes.status !== 200) {
        throw new Error(`Failed to fetch requirements for doc_type_id ${id}`);
      }

      const list = typeRes.body.requirements;
      if (list.length === 0) {
        throw new Error(`Doc type ${id} has no configured requirements!`);
      }

      for (const item of list) {
        if (!item.source_office || item.source_office === 'Not specified') {
          throw new Error(`Checklist item "${item.form_name}" in doc_type ${id} is missing source office!`);
        }
      }
      console.log(`   ✅ Doc Type ${id}: ${list.length} checklist items with verified source offices.`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Required vs Optional Distinction (REQ-REQT-2)
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Required vs. Optional Distinction (REQ-REQT-2)...');
    const travelRes = await request('/document-types/5/requirements', { headers: facultyHeaders });
    if (travelRes.status !== 200) {
      throw new Error(`Failed to fetch Travel Order requirements: ${travelRes.status}`);
    }

    const travelReqs = travelRes.body.requirements;
    const requiredItems = travelReqs.filter((r) => r.required === true);
    const optionalItems = travelReqs.filter((r) => r.required === false);

    if (requiredItems.length === 0) {
      throw new Error('Travel Order has no required items.');
    }
    if (optionalItems.length === 0) {
      throw new Error('Travel Order expected optional item (Detailed Activity Design).');
    }

    console.log(`   ✅ Travel Order has ${requiredItems.length} required items and ${optionalItems.length} optional item(s).`);
    console.log(`      Optional item: "${optionalItems[0].form_name}" from "${optionalItems[0].source_office}"`);

    // -------------------------------------------------------------------------
    // TEST 4: Secretary / Admin CRUD Configuration (REQ-REQT-1)
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Secretary / Admin Requirements Configuration (REQ-REQT-1)...');

    // 4A: Create new requirement as Secretary
    const newRequirementPayload = {
      form_name: 'Official Endorsement Slip (Test Item)',
      is_required: true,
      source_office: "Office of the College Secretary",
      template_url: '/templates/Test_Endorsement_Template.pdf',
    };

    const createRes = await request('/document-types/1/requirements', {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify(newRequirementPayload),
    });

    if (createRes.status !== 201) {
      throw new Error(`Secretary failed to add requirement: ${createRes.status} ${JSON.stringify(createRes.body)}`);
    }

    const createdForm = createRes.body.requirement;
    const testFormId = createdForm.form_id || createdForm.id;
    console.log(`   ✅ Secretary added requirement: ID ${testFormId} - "${createdForm.form_name}"`);

    // 4B: Requester immediately sees the newly added requirement
    const updatedIncRes = await request('/document-types/1/requirements', { headers: studentHeaders });
    const foundAdded = updatedIncRes.body.requirements.find((r) => r.form_id === testFormId);
    if (!foundAdded) {
      throw new Error('Student cannot see the newly added requirement in the checklist.');
    }
    console.log('   ✅ Student immediately sees newly added requirement in dynamic checklist.');

    // 4C: Update requirement as Secretary
    const updatePayload = {
      source_office: 'Updated Office of the Dean (Room 204)',
      is_required: false,
    };
    const updateRes = await request(`/document-types/1/requirements/${testFormId}`, {
      method: 'PUT',
      headers: secretaryHeaders,
      body: JSON.stringify(updatePayload),
    });

    if (updateRes.status !== 200) {
      throw new Error(`Secretary failed to update requirement: ${updateRes.status} ${JSON.stringify(updateRes.body)}`);
    }
    const updatedForm = updateRes.body.requirement;
    if (updatedForm.source_office !== 'Updated Office of the Dean (Room 204)' || updatedForm.required !== false) {
      throw new Error(`Update not reflected in returned object: ${JSON.stringify(updatedForm)}`);
    }
    console.log(`   ✅ Secretary updated requirement: Source -> "${updatedForm.source_office}", Required -> ${updatedForm.required}`);

    // 4D: Delete requirement as Secretary
    const deleteRes = await request(`/document-types/1/requirements/${testFormId}`, {
      method: 'DELETE',
      headers: secretaryHeaders,
    });

    if (deleteRes.status !== 200) {
      throw new Error(`Secretary failed to delete requirement: ${deleteRes.status} ${JSON.stringify(deleteRes.body)}`);
    }
    console.log(`   ✅ Secretary successfully deleted test requirement ID ${testFormId}.`);

    // Verify deletion
    const verifyDelRes = await request('/document-types/1/requirements', { headers: studentHeaders });
    const stillExists = verifyDelRes.body.requirements.some((r) => r.form_id === testFormId);
    if (stillExists) {
      throw new Error('Deleted requirement still exists in checklist!');
    }
    console.log('   ✅ Verified requirement clean deletion from database.');

    // -------------------------------------------------------------------------
    // TEST 5: RBAC Security Guard on Requirement Configuration
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing RBAC Security Guard on Requirement Configuration...');

    // 5A: Student attempts to POST requirement -> 403 Forbidden
    const studentCreateAttempt = await request('/document-types/1/requirements', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(newRequirementPayload),
    });
    if (studentCreateAttempt.status !== 403) {
      throw new Error(`Student was not blocked with 403 on requirement creation: got ${studentCreateAttempt.status}`);
    }
    console.log('   ✅ Student blocked from adding requirements (403 Forbidden).');

    // 5B: Faculty attempts to DELETE requirement -> 403 Forbidden
    const facultyDeleteAttempt = await request('/document-types/1/requirements/1', {
      method: 'DELETE',
      headers: facultyHeaders,
    });
    if (facultyDeleteAttempt.status !== 403) {
      throw new Error(`Faculty was not blocked with 403 on requirement deletion: got ${facultyDeleteAttempt.status}`);
    }
    console.log('   ✅ Faculty blocked from deleting requirements (403 Forbidden).');

    // 5C: Unauthenticated request -> 401 Unauthorized
    const unauthAttempt = await request('/document-types/1/requirements');
    if (unauthAttempt.status !== 401) {
      throw new Error(`Unauthenticated request did not return 401: got ${unauthAttempt.status}`);
    }
    console.log('   ✅ Unauthenticated request blocked (401 Unauthorized).');

    console.log('\n================================================================');
    console.log('🎉 ALL PB-11 INTEGRATION TESTS PASSED (5 of 5)!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ PB-11 TEST FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
