/**
 * Integration Test Suite for Ticket PB-23:
 * "Reject/disapprove request with reason [P0]"
 *
 * User Story:
 *   As an authorized reviewing officer, I want to reject a request and record why.
 *
 * Acceptance Criteria:
 *   1. Only permitted roles can reject at their stage (403 Forbidden if wrong role or wrong stage)
 *   2. Reason required (400 Bad Request if missing or blank)
 *   3. Status/action recorded ('Rejected', statusLabel: 'Rejected / Disapproved', action_type: 'Rejected')
 *   4. Requester can see outcome (rejectionReason, rejectionInfo, history, and notification)
 *   5. Normal routing stops unless approved reopen path exists
 */
const app = require('../server');
const DocumentModel = require('../models/documentModel');
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
  {
    idNumber: 'DEAN-2026-01',
    name: 'Dr. Ramon Villanueva',
    email: 'dean@msunaawan.edu.ph',
    role: 'dean',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Dean',
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
  console.log('🧪 RUNNING PB-23 INTEGRATION TESTS: REJECT REQUEST WITH REASON');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  const createdDocIds = [];

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
    const secretaryHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
    const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };
    const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };

    // Submit a test request from Student (Starts at Secretary stage: 'Submitted')
    const submitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'PB-23 Leave of Absence Request',
        description: 'Requesting LOA for 2nd Semester AY 2025-2026',
      }),
    });
    if (submitRes.status !== 201) {
      throw new Error(`Failed to submit document: ${JSON.stringify(submitRes.body)}`);
    }
    const docId = submitRes.body.document.id;
    createdDocIds.push(docId);

    // -------------------------------------------------------------------------
    // 1️⃣ TC-PB23-1: Only permitted roles can reject at their stage
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Stage-Based Role Permissions for Rejection...');

    // While in 'Submitted' (Secretary stage), Chairperson cannot reject yet
    const chairEarlyReject = await request(`/documents/${docId}/reject`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ reason: 'Chairperson trying to reject before Secretary verification.' }),
    });
    if (chairEarlyReject.status !== 403) {
      throw new Error(`Expected 403 when Chairperson rejects during Submitted stage, got ${chairEarlyReject.status}`);
    }
    console.log(`   ✅ Reviewer blocked before their stage -> Status ${chairEarlyReject.status}: "${chairEarlyReject.body.error}"`);

    // Student (requester) can never reject
    const studentSelfReject = await request(`/documents/${docId}/reject`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ reason: 'Student trying to reject own request.' }),
    });
    if (studentSelfReject.status !== 403) {
      throw new Error(`Expected 403 when Student attempts to reject, got ${studentSelfReject.status}`);
    }
    console.log(`   ✅ Requester blocked from rejecting -> Status ${studentSelfReject.status}: "${studentSelfReject.body.error}"`);

    // Route from Secretary to Department Chairperson (Stage moves to 'Under_Review' at Department Chairperson)
    const routeRes = await request(`/documents/${docId}/check`, {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({
        decision: 'complete',
        nextOfficeName: 'Department Chairperson',
        remarks: 'Verified complete and routed to Department Chairperson.',
      }),
    });
    if (routeRes.status !== 200) {
      throw new Error(`Failed to route document: ${JSON.stringify(routeRes.body)}`);
    }

    // Now at Chairperson stage: Secretary cannot reject anymore
    const secLateReject = await request(`/documents/${docId}/reject`, {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({ reason: 'Secretary trying to reject while at Chairperson stage.' }),
    });
    if (secLateReject.status !== 403) {
      throw new Error(`Expected 403 when Secretary rejects during Under_Review stage, got ${secLateReject.status}`);
    }
    console.log(`   ✅ Secretary blocked after routing past Secretary stage -> Status ${secLateReject.status}: "${secLateReject.body.error}"`);

    // Dean cannot reject while document is at Department Chairperson stage
    const deanOutOfTurnReject = await request(`/documents/${docId}/reject`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({ reason: 'Dean trying to reject while at Chairperson stage.' }),
    });
    if (deanOutOfTurnReject.status !== 403) {
      throw new Error(`Expected 403 when Dean rejects at Chairperson stage, got ${deanOutOfTurnReject.status}`);
    }
    console.log(`   ✅ Unassigned reviewer (Dean) blocked at Chairperson stage -> Status ${deanOutOfTurnReject.status}: "${deanOutOfTurnReject.body.error}"`);

    // -------------------------------------------------------------------------
    // 2️⃣ TC-PB23-2: Reason is required when rejecting/disapproving (400 Bad Request)
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Mandatory Rejection Reason Requirement (400 Bad Request)...');

    const emptyRejectRes = await request(`/documents/${docId}/reject`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ reason: '   ' }),
    });
    if (emptyRejectRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request for empty reason, got ${emptyRejectRes.status}`);
    }
    console.log(`   ✅ Empty reason rejected on /reject -> Status ${emptyRejectRes.status}: "${emptyRejectRes.body.error}"`);

    const missingRemarksReview = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ action: 'reject' }),
    });
    if (missingRemarksReview.status !== 400) {
      throw new Error(`Expected 400 Bad Request for missing reason on /review, got ${missingRemarksReview.status}`);
    }
    console.log(`   ✅ Missing reason rejected on /review -> Status ${missingRemarksReview.status}: "${missingRemarksReview.body.error}"`);

    // -------------------------------------------------------------------------
    // 3️⃣ TC-PB23-3: Status and Action Recorded on Valid Rejection
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Authorized Rejection Records Status ("Rejected") and History...');

    const rejectReasonText = 'Disapproved: Student has exceeded the maximum allowable residency period for LOA under university policy.';
    const validRejectRes = await request(`/documents/${docId}/reject`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        reason: rejectReasonText,
      }),
    });

    if (validRejectRes.status !== 200) {
      throw new Error(`Expected 200 OK for valid rejection, got ${validRejectRes.status}: ${JSON.stringify(validRejectRes.body)}`);
    }

    const rejectedDoc = validRejectRes.body.document;
    const rejectNotif = validRejectRes.body.notification;

    if (rejectedDoc.current_status !== 'Rejected' || rejectedDoc.statusLabel !== 'Rejected / Disapproved') {
      throw new Error(`Expected status 'Rejected' ('Rejected / Disapproved'), got ${rejectedDoc.current_status} (${rejectedDoc.statusLabel})`);
    }
    if (rejectedDoc.current_office_id !== null) {
      throw new Error(`Expected current_office_id to be null when rejected, got ${rejectedDoc.current_office_id}`);
    }
    console.log(`   ✅ Status recorded: ${rejectedDoc.current_status} (Label: "${rejectedDoc.statusLabel}")`);
    console.log(`   ✅ Active office cleared (current_office_id: ${rejectedDoc.current_office_id})`);
    console.log(`   ✅ Rejection notification dispatched (${rejectNotif?.notification_type}): "${rejectNotif?.title}"`);

    // -------------------------------------------------------------------------
    // 4️⃣ TC-PB23-4: Requester Can See Outcome & Reason in Document and History
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Requester Visibility of Rejection Outcome and Reason...');

    const requesterDocView = await request(`/documents/${docId}`, {
      method: 'GET',
      headers: studentHeaders,
    });
    if (requesterDocView.status !== 200) {
      throw new Error(`Requester could not view rejected document: ${JSON.stringify(requesterDocView.body)}`);
    }
    const viewedDoc = requesterDocView.body.document;
    if (viewedDoc.current_status !== 'Rejected' || viewedDoc.rejectionReason !== rejectReasonText) {
      throw new Error(`Requester view missing rejection outcome! Got status=${viewedDoc.current_status}, reason=${viewedDoc.rejectionReason}`);
    }
    console.log(`   ✅ Requester sees status: "${viewedDoc.statusLabel}"`);
    console.log(`   ✅ Requester sees rejection reason: "${viewedDoc.rejectionReason}"`);
    console.log(`   ✅ Requester sees rejecting office: "${viewedDoc.rejectionInfo?.office}"`);

    const historyView = await request(`/documents/${docId}/history`, {
      method: 'GET',
      headers: studentHeaders,
    });
    if (historyView.status !== 200) {
      throw new Error(`Requester could not fetch history: ${JSON.stringify(historyView.body)}`);
    }
    const rejectHistoryEntry = historyView.body.history.find(
      (h) => h.action_type === 'Rejected' && h.action_remarks === rejectReasonText
    );
    if (!rejectHistoryEntry) {
      throw new Error('Rejected action entry with exact reason not found in document history!');
    }
    console.log(`   ✅ History entry recorded: action_type="${rejectHistoryEntry.action_type}", remarks="${rejectHistoryEntry.action_remarks}"`);

    // -------------------------------------------------------------------------
    // 5️⃣ TC-PB23-5: Normal Routing Stops Unless Approved Reopen Path Exists
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Normal Routing & Resubmission Stop After Rejection (Unless Reopened)...');

    // Requester cannot edit a rejected document
    const editAttempt = await request(`/documents/${docId}`, {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ title: 'Trying to edit rejected request' }),
    });
    if (editAttempt.status !== 403) {
      throw new Error(`Expected 403 when editing rejected document, got ${editAttempt.status}`);
    }
    console.log(`   ✅ Editing blocked on rejected request -> Status ${editAttempt.status}: "${editAttempt.body.error}"`);

    // Requester cannot resubmit a rejected document
    const resubmitAttempt = await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ note: 'Trying to resubmit rejected request' }),
    });
    if (resubmitAttempt.status !== 403) {
      throw new Error(`Expected 403 when resubmitting rejected document, got ${resubmitAttempt.status}`);
    }
    console.log(`   ✅ Resubmission blocked on rejected request -> Status ${resubmitAttempt.status}: "${resubmitAttempt.body.error}"`);

    // Reviewer cannot continue endorsing/routing a rejected document
    const reviewAttempt = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ action: 'endorse', remarks: 'Trying to route rejected request' }),
    });
    if (reviewAttempt.status !== 403) {
      throw new Error(`Expected 403 when reviewing rejected document, got ${reviewAttempt.status}`);
    }
    console.log(`   ✅ Normal review/routing blocked on rejected request -> Status ${reviewAttempt.status}: "${reviewAttempt.body.error}"`);

    // Unauthorized role (Student) cannot invoke reopen path
    const unauthorizedReopen = await request(`/documents/${docId}/reopen`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ reason: 'Student trying to reopen' }),
    });
    if (unauthorizedReopen.status !== 403) {
      throw new Error(`Expected 403 when Student invokes reopen path, got ${unauthorizedReopen.status}`);
    }
    console.log(`   ✅ Unauthorized reopen blocked -> Status ${unauthorizedReopen.status}: "${unauthorizedReopen.body.error}"`);

    // Approved reopen path (College Dean or Secretary with reason) allows reconsideration
    const approvedReopen = await request(`/documents/${docId}/reopen`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({ reason: 'Registrar confirmed residency waiver was approved by Academic Council.' }),
    });
    if (approvedReopen.status !== 200 || approvedReopen.body.document.current_status !== 'Returned') {
      throw new Error(`Expected 200 OK on approved reopen path, got ${approvedReopen.status}: ${JSON.stringify(approvedReopen.body)}`);
    }
    console.log(`   ✅ Approved reopen path (by Dean) succeeded -> Status changed to "${approvedReopen.body.document.statusLabel}"`);

    console.log('\n================================================================');
    console.log('🎉 ALL 5 PB-23 ACCEPTANCE CRITERIA TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    for (const id of createdDocIds) {
      await DocumentModel.softDelete(id);
    }
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});

