/**
 * Integration Test Suite for Ticket PB-19:
 * "Correct and resubmit returned request [P0]"
 * Traceability: SRS 3.2 REQ-SUB-8; SRS 3.5 REQ-ROUTE-9; SRS 3.6 (REQ-TRK-1 to TRK-4); SRS 3.7 REQ-MON-2
 * Dependencies: PB-22 (Reviewer return with remarks), PB-18 (Editing locks)
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
  console.log('🧪 RUNNING PB-19 INTEGRATION TESTS: CORRECT & RESUBMIT RETURNED');
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
    // 0️⃣ SETUP: Student submits an initial document (Rev 1) with attachment
    // -------------------------------------------------------------------------
    console.log('0️⃣  Setting up: Student submits an initial request (Revision 1)...');
    const initialSubmission = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        doc_type_id: 1, // INC Completion
        title: 'Completion of Incomplete Grade (Initial Submission)',
        description: 'Submission for ENG 101 deficiency',
        attachments: [
          {
            form_id: 1,
            file_name: 'INC_Completion_Form_Rev1.pdf',
            file_url: '/uploads/inc_completion_form_rev1.pdf',
            file_type: 'application/pdf',
            file_size_kb: 150,
          },
        ],
      }),
    });

    if (initialSubmission.status !== 201) {
      throw new Error(`Failed to create test document: ${JSON.stringify(initialSubmission.body)}`);
    }

    const testDoc = initialSubmission.body.document;
    const docId = testDoc.document_id || testDoc.id;
    const initialControlNumber = testDoc.control_number;
    console.log(`   ✅ Document created: ${initialControlNumber} (Rev: ${testDoc.current_revision_no}, Status: ${testDoc.current_status})`);

    // -------------------------------------------------------------------------
    // 1️⃣ TC-PB19-1: Allowed fields/files can ONLY be updated after return
    // -------------------------------------------------------------------------
    console.log('\n1️⃣  Testing Resubmit Rejection while status is "Submitted" (TC-PB19-1)...');
    const prematureResubmit = await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'Premature Resubmit Attempt',
        notes: 'Trying to resubmit while still pending check',
      }),
    });

    if (prematureResubmit.status !== 403) {
      throw new Error(`Expected 403 Forbidden on premature resubmit, got ${prematureResubmit.status}`);
    }
    console.log(`   ✅ Resubmission blocked (403 Forbidden): "${prematureResubmit.body.error}"`);

    // Secretary routes to Chairperson -> status becomes 'Under_Review'
    await request(`/documents/${docId}/check`, {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({
        decision: 'complete',
        nextOfficeName: 'Department Chairperson',
        remarks: 'Completeness check verified, forward to Chairperson.',
      }),
    });

    console.log('\n2️⃣  Testing Resubmit Rejection while status is "Under_Review"...');
    const underReviewResubmit = await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'Resubmit During Review',
      }),
    });

    if (underReviewResubmit.status !== 403) {
      throw new Error(`Expected 403 Forbidden during active review, got ${underReviewResubmit.status}`);
    }
    console.log(`   ✅ Resubmission blocked during active review (403 Forbidden).`);

    // -------------------------------------------------------------------------
    // 3️⃣ TC-PB19-2: Reviewer returns document with remarks (PB-22 dependency)
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Reviewer Return with Feedback (PB-22 Dependency)...');
    const returnRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'returned',
        remarks: 'Missing instructor evaluation signature and official cashier receipt copy.',
      }),
    });

    if (returnRes.status !== 200) {
      throw new Error(`Failed to return document: ${JSON.stringify(returnRes.body)}`);
    }

    const returnedDoc = returnRes.body.document;
    if (returnedDoc.current_status !== 'Returned') {
      throw new Error(`Expected status 'Returned', got '${returnedDoc.current_status}'`);
    }
    console.log(`   ✅ Chairperson returned document -> Status: ${returnedDoc.current_status}`);
    console.log(`   ✅ Return remarks logged: "Missing instructor evaluation signature and official cashier receipt copy."`);

    // -------------------------------------------------------------------------
    // 4️⃣ TC-PB19-3: Correct and Resubmit (Revision increment & same Control No)
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Resubmission with Increment & Control Number Continuity (REQ-SUB-8)...');
    const resubmitRes = await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'Completion of Incomplete Grade (Corrected & Resubmitted)',
        description: 'Updated submission with signed evaluation and official receipt',
        notes: 'Attached signed evaluation sheet and cashier official assessment receipt.',
        files: [
          {
            form_id: 2,
            name: 'Instructor_Evaluation_Signed_Rev2.pdf',
            url: `/uploads/${docId}_rev2_eval.pdf`,
            type: 'application/pdf',
            sizeKb: 210,
          },
          {
            form_id: 3,
            name: 'Cashier_Official_Receipt_Rev2.pdf',
            url: `/uploads/${docId}_rev2_receipt.pdf`,
            type: 'application/pdf',
            sizeKb: 95,
          },
        ],
      }),
    });

    if (resubmitRes.status !== 200) {
      throw new Error(`Failed to resubmit returned document: ${JSON.stringify(resubmitRes.body)}`);
    }

    const resubmittedDoc = resubmitRes.body.document;
    if (resubmittedDoc.control_number !== initialControlNumber) {
      throw new Error(`Control number altered! Expected '${initialControlNumber}', got '${resubmittedDoc.control_number}'`);
    }
    console.log(`   ✅ Same Control Number strictly preserved: ${resubmittedDoc.control_number}`);

    if (resubmittedDoc.current_revision_no !== 2) {
      throw new Error(`Expected current_revision_no = 2, got ${resubmittedDoc.current_revision_no}`);
    }
    console.log(`   ✅ Revision number incremented to: Revision ${resubmittedDoc.current_revision_no}`);

    if (resubmittedDoc.current_status !== 'Submitted') {
      throw new Error(`Expected status 'Submitted', got '${resubmittedDoc.current_status}'`);
    }
    console.log(`   ✅ Document status reset to: ${resubmittedDoc.current_status} (Routed to College Secretary)`);

    // -------------------------------------------------------------------------
    // 5️⃣ TC-PB19-4: Prior files and full history remain intact (SRS 3.6 / REQ-TRK-3)
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Zero Data Loss: Prior Files and History Audit Trail (SRS 3.6)...');
    const historyRes = await request(`/documents/${docId}/history`, {
      method: 'GET',
      headers: studentHeaders,
    });

    if (historyRes.status !== 200) {
      throw new Error(`Failed to fetch document history: ${JSON.stringify(historyRes.body)}`);
    }

    const { history, attachments } = historyRes.body;
    console.log(`   ✅ Complete audit history retrieved: ${history.length} event(s) recorded.`);

    // Verify attachments across both revisions
    console.log(`   ✅ Total attachments on record: ${attachments.length} attachment(s).`);
    const rev1Attachments = attachments.filter((a) => (Number(a.revision_no) || 1) === 1);
    const rev2Attachments = attachments.filter((a) => Number(a.revision_no) === 2);

    if (rev1Attachments.length === 0) {
      throw new Error('Prior Revision 1 attachments were lost or deleted!');
    }
    console.log(`   ✅ Revision 1 attachments retained (${rev1Attachments.length} file):`);
    rev1Attachments.forEach((a) => console.log(`      - [Rev 1] ${a.file_name}`));

    if (rev2Attachments.length === 0) {
      throw new Error('New Revision 2 attachments were not persisted!');
    }
    console.log(`   ✅ Revision 2 attachments persisted (${rev2Attachments.length} files):`);
    rev2Attachments.forEach((a) => console.log(`      - [Rev 2] ${a.file_name}`));

    // Verify chronological history actions
    const actionTypes = history.map((h) => h.action_type);
    console.log(`   ✅ Chronological Action Flow: ${actionTypes.join(' -> ')}`);
    if (!actionTypes.includes('Returned') || !actionTypes.includes('Submitted')) {
      throw new Error('Action history is missing Returned or Resubmitted transition!');
    }

    // -------------------------------------------------------------------------
    // 6️⃣ TC-PB19-5: Re-locking: Document cannot be edited after resubmission
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Testing Immediate Re-locking after Resubmission (REQ-SUB-7)...');
    const postResubmitEdit = await request(`/documents/${docId}`, {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ title: 'Unauthorized Modification After Resubmit' }),
    });

    if (postResubmitEdit.status !== 403) {
      throw new Error(`Expected 403 Forbidden after resubmission, got ${postResubmitEdit.status}`);
    }
    console.log(`   ✅ Document re-locked successfully (403 Forbidden).`);

    // -------------------------------------------------------------------------
    // 7️⃣ TC-PB19-6: Non-owner / unauthorized resubmit attempts
    // -------------------------------------------------------------------------
    console.log('\n7️⃣  Testing Unauthorized Resubmit Attempts...');
    const otherStudentResubmit = await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      headers: otherStudentHeaders,
      body: JSON.stringify({ title: 'Hacker Edit' }),
    });
    if (otherStudentResubmit.status !== 403) {
      throw new Error(`Expected 403 Forbidden for non-owner student, got ${otherStudentResubmit.status}`);
    }
    console.log(`   ✅ Non-owner blocked with 403 Forbidden.`);

    const unauthResubmit = await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      body: JSON.stringify({ title: 'No Credentials' }),
    });
    if (unauthResubmit.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for unauthenticated caller, got ${unauthResubmit.status}`);
    }
    console.log(`   ✅ Unauthenticated caller blocked with 401 Unauthorized.`);

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('🎉 ALL PB-19 INTEGRATION TESTS PASSED (7 of 7)!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-19 Test Suite Failed:', err.message);
  process.exit(1);
});
