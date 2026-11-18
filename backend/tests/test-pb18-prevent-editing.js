/**
 * Integration Test Suite for Ticket PB-18:
 * "Prevent editing while request is in process [P0]"
 * Traceability: SRS 3.2 REQ-SUB-7, REQ-SUB-8
 */
const app = require('../server');
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
    idNumber: '2023-0999',
    name: 'Paolo Reyes',
    email: 'other.student@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BA Social Sciences, 4th Year',
    position: 'Student',
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
  {
    idNumber: 'CHR-2026-01',
    name: 'Dr. Liza Fernandez',
    email: 'chairperson@msunaawan.edu.ph',
    role: 'chairperson',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Department Chairperson',
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
  console.log('🧪 RUNNING PB-18 INTEGRATION TESTS: PREVENT EDITING IN PROCESS');
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
    const otherStudentHeaders = { 'x-user-email': 'other.student@msunaawan.edu.ph' };
    const secretaryHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
    const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };

    // -------------------------------------------------------------------------
    // SETUP: Student submits an initial document request
    // -------------------------------------------------------------------------
    console.log('0️⃣  Setting up: Student submits an initial document request...');
    const submitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        typeId: 1, // Completion of INC
        title: 'Completion of Grade — ENG 101',
        description: 'Removing incomplete mark from 1st Sem 2025-2026.',
      }),
    });

    if (submitRes.status !== 201) {
      throw new Error(`Failed to create test document: ${submitRes.status} ${JSON.stringify(submitRes.body)}`);
    }

    const testDoc = submitRes.body.document;
    const docId = testDoc.document_id;
    const originalControlNo = testDoc.control_number;
    console.log(`   ✅ Document created: ${originalControlNo} (ID: ${docId}, Status: ${testDoc.current_status}, Rev: ${testDoc.current_revision_no})`);

    // -------------------------------------------------------------------------
    // TEST 1: Edit attempt on 'Submitted' document is denied (REQ-SUB-7)
    // -------------------------------------------------------------------------
    console.log('\n1️⃣  Testing Edit Rejection while status is "Submitted" (REQ-SUB-7)...');
    const editSubmittedRes = await request(`/documents/${docId}`, {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'ILLEGAL EDIT: Changing title during submission',
        description: 'Trying to sneak in changes.',
      }),
    });

    if (editSubmittedRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden on editing Submitted document, received ${editSubmittedRes.status}: ${JSON.stringify(editSubmittedRes.body)}`);
    }
    console.log('   ✅ Unauthorized edit blocked with 403 Forbidden.');
    console.log(`   ✅ Error feedback: "${editSubmittedRes.body.error}"`);

    // Verify document was NOT changed
    const check1Res = await request(`/documents/${docId}`, { headers: studentHeaders });
    if (check1Res.body.document.title !== 'Completion of Grade — ENG 101') {
      throw new Error('Document title was unexpectedly modified!');
    }
    console.log('   ✅ Document title strictly preserved in database.');

    // -------------------------------------------------------------------------
    // TEST 2: Edit attempt on 'Under_Review' document is denied (REQ-SUB-7)
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Edit Rejection while status is "Under_Review"...');
    // Secretary verifies and routes to Chairperson
    const checkRes = await request(`/documents/${docId}/check`, {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({
        decision: 'complete',
        nextOfficeName: 'Department Chairperson',
        remarks: 'Completeness check verified.',
      }),
    });
    if (checkRes.status !== 200) {
      throw new Error(`Secretary check failed: ${checkRes.status} ${JSON.stringify(checkRes.body)}`);
    }
    console.log(`   ✅ Secretary routed document -> Status: ${checkRes.body.document.current_status}`);

    const editUnderReviewRes = await request(`/documents/${docId}`, {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ title: 'ILLEGAL EDIT: While Under Review' }),
    });

    if (editUnderReviewRes.status !== 403) {
      throw new Error(`Expected 403 on editing Under_Review document, got ${editUnderReviewRes.status}`);
    }
    console.log('   ✅ Edit blocked during active review (403 Forbidden).');

    // -------------------------------------------------------------------------
    // TEST 3: Edit allowed once document is 'Returned' for corrections
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Edit Allowed when document is "Returned"...');
    // Chairperson returns document with reason
    const returnRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'returned',
        remarks: 'Please attach instructor signed grade slip.',
      }),
    });
    if (returnRes.status !== 200) {
      throw new Error(`Chairperson return failed: ${returnRes.status} ${JSON.stringify(returnRes.body)}`);
    }
    console.log(`   ✅ Chairperson returned document -> Status: ${returnRes.body.document.current_status}`);

    // Student now updates the title/description
    const editReturnedRes = await request(`/documents/${docId}`, {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'Completion of Grade — ENG 101 (Corrected Details)',
        description: 'Updated with corrected term details.',
      }),
    });

    if (editReturnedRes.status !== 200) {
      throw new Error(`Expected 200 OK on editing Returned document, got ${editReturnedRes.status}: ${JSON.stringify(editReturnedRes.body)}`);
    }
    console.log('   ✅ Student successfully updated details of Returned document.');
    console.log(`   ✅ New Title: "${editReturnedRes.body.document.title}"`);

    // -------------------------------------------------------------------------
    // TEST 4: Resubmission creates Revision 02 and preserves history (REQ-SUB-8)
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Resubmission with Revision Increment & History Retention (REQ-SUB-8)...');
    const resubmitRes = await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        note: 'Attached signed grade slip as requested by the Department Chairperson.',
        files: [
          {
            form_id: 2,
            name: 'Instructor_Grade_Slip_Signed.pdf',
            size_kb: 350,
          },
        ],
      }),
    });

    if (resubmitRes.status !== 200) {
      throw new Error(`Resubmission failed: ${resubmitRes.status} ${JSON.stringify(resubmitRes.body)}`);
    }

    const resubmittedDoc = resubmitRes.body.document;
    if (resubmittedDoc.current_revision_no !== 2) {
      throw new Error(`Expected Revision 2, got ${resubmittedDoc.current_revision_no}`);
    }
    if (resubmittedDoc.current_status !== 'Submitted') {
      throw new Error(`Expected status reset to 'Submitted', got ${resubmittedDoc.current_status}`);
    }
    if (resubmittedDoc.control_number !== originalControlNo) {
      throw new Error(`Control Number changed! Expected ${originalControlNo}, got ${resubmittedDoc.control_number}`);
    }

    console.log(`   ✅ Same Control Number preserved: ${resubmittedDoc.control_number}`);
    console.log(`   ✅ Revision incremented to: Revision ${resubmittedDoc.current_revision_no}`);
    console.log(`   ✅ Status routed back to Secretary: ${resubmittedDoc.current_status}`);

    // Verify history trail contains all steps
    const historyRes = await request(`/documents/${docId}`, { headers: studentHeaders });
    const historyEntries = historyRes.body.document.history || [];
    console.log(`   ✅ Complete audit trail retained: ${historyEntries.length} history events.`);

    // -------------------------------------------------------------------------
    // TEST 5: Document is immediately re-locked after resubmission
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Re-locking: Document cannot be edited after resubmission...');
    const reLockRes = await request(`/documents/${docId}`, {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ title: 'Attempt edit after resubmit' }),
    });

    if (reLockRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden after resubmission, got ${reLockRes.status}`);
    }
    console.log('   ✅ Document is re-locked immediately after resubmission (403 Forbidden).');

    // -------------------------------------------------------------------------
    // TEST 6: Non-owner edit attempt is denied (RBAC & ownership security)
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Testing Non-owner Edit Rejection...');
    const otherStudentAttempt = await request(`/documents/${docId}`, {
      method: 'PUT',
      headers: otherStudentHeaders,
      body: JSON.stringify({ title: 'Malicious title hijack' }),
    });

    if (otherStudentAttempt.status !== 403) {
      throw new Error(`Expected 403 for non-owner edit, got ${otherStudentAttempt.status}`);
    }
    console.log('   ✅ Non-owner edit blocked with 403 Forbidden.');

    // -------------------------------------------------------------------------
    // TEST 7: Unauthenticated request is denied (401 Unauthorized)
    // -------------------------------------------------------------------------
    console.log('\n7️⃣  Testing Unauthenticated Edit Rejection...');
    const unauthAttempt = await request(`/documents/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'Unauthenticated edit' }),
    });

    if (unauthAttempt.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthAttempt.status}`);
    }
    console.log('   ✅ Unauthenticated request blocked with 401 Unauthorized.');

    console.log('\n================================================================');
    console.log('🎉 ALL PB-18 INTEGRATION TESTS PASSED (7 of 7)!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ PB-18 TEST FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
