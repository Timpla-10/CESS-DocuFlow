/**
 * Integration Test Suite for Ticket PB-22:
 * "Return a request with required reason [P0]"
 *
 * User Story:
 *   As an authorized reviewer, I want to return a document for correction and explain why.
 *
 * Acceptance Criteria:
 *   1. Reason is required (missing/blank reason returns 400 Bad Request)
 *   2. Status changes to Returned for Revision ('Returned' / statusLabel: 'Returned for Revision')
 *   3. Reason appears to requester and in document history
 *   4. Notification follows requester's preference (Both, Email, In_System)
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
  console.log('🧪 RUNNING PB-22 INTEGRATION TESTS: RETURN REQUEST WITH REASON');
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

    // Submit a test request from Student and route to Department Chairperson
    const submitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'PB-22 Completion of INC Grade Request',
        description: 'Requesting completion of INC in EDUC 101',
      }),
    });
    if (submitRes.status !== 201) {
      throw new Error(`Failed to submit document: ${JSON.stringify(submitRes.body)}`);
    }
    const docId = submitRes.body.document.id;
    createdDocIds.push(docId);

    // Route from Secretary to Department Chairperson
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

    // -------------------------------------------------------------------------
    // 1️⃣ TC-PB22-1: Reason is required when returning a document (400 Bad Request)
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Mandatory Reason Requirement (POST /api/documents/:id/return & /review)...');

    const emptyReturnRes = await request(`/documents/${docId}/return`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ reason: '   ' }),
    });
    if (emptyReturnRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request for empty reason, got ${emptyReturnRes.status}`);
    }
    console.log(`   ✅ Empty reason rejected -> Status ${emptyReturnRes.status}: "${emptyReturnRes.body.error}"`);

    const missingRemarksReview = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ action: 'returned' }),
    });
    if (missingRemarksReview.status !== 400) {
      throw new Error(`Expected 400 Bad Request for missing remarks, got ${missingRemarksReview.status}`);
    }
    console.log(`   ✅ Missing reason on /review rejected -> Status ${missingRemarksReview.status}: "${missingRemarksReview.body.error}"`);

    // -------------------------------------------------------------------------
    // 2️⃣ TC-PB22-2: Unauthorized reviewer / user cannot return the document (403)
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing RBAC Guard: Unassigned Reviewer / Requester Blocked (403 Forbidden)...');

    const unassignedDeanReturn = await request(`/documents/${docId}/return`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({ reason: 'Dean trying to return before routed to Dean.' }),
    });
    if (unassignedDeanReturn.status !== 403) {
      throw new Error(`Expected 403 Forbidden for unassigned Dean, got ${unassignedDeanReturn.status}`);
    }
    console.log(`   ✅ Unassigned reviewer blocked -> Status ${unassignedDeanReturn.status}: "${unassignedDeanReturn.body.error}"`);

    const studentSelfReturn = await request(`/documents/${docId}/return`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ reason: 'Student trying to return own request.' }),
    });
    if (studentSelfReturn.status !== 403) {
      throw new Error(`Expected 403 Forbidden for Student, got ${studentSelfReturn.status}`);
    }
    console.log(`   ✅ Requester self-return blocked -> Status ${studentSelfReturn.status}: "${studentSelfReturn.body.error}"`);

    // -------------------------------------------------------------------------
    // 3️⃣ TC-PB22-3: Set Requester Notification Preference & Return with Reason
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Authorized Return with Required Reason & Status Change to "Returned for Revision"...');

    // Set Student's notification preference to 'email_only' first to verify preference adherence
    const prefUpdateRes = await request('/documents/preferences', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ preference: 'email_only' }),
    });
    if (prefUpdateRes.status !== 200 || prefUpdateRes.body.preference.deliveryMethod !== 'Email') {
      throw new Error(`Failed to set notification preference: ${JSON.stringify(prefUpdateRes.body)}`);
    }
    console.log(`   ✅ Requester notification preference set to: ${prefUpdateRes.body.preference.preference} (Delivery: ${prefUpdateRes.body.preference.deliveryMethod})`);

    const returnReasonText = 'Missing instructor signature on the INC Completion Form (Section B). Please re-upload signed copy.';
    const validReturnRes = await request(`/documents/${docId}/return`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        reason: returnReasonText,
      }),
    });

    if (validReturnRes.status !== 200) {
      throw new Error(`Expected 200 OK for valid return, got ${validReturnRes.status}: ${JSON.stringify(validReturnRes.body)}`);
    }

    const returnedDoc = validReturnRes.body.document;
    const dispatchedNotif = validReturnRes.body.notification;

    if (returnedDoc.current_status !== 'Returned' || returnedDoc.statusLabel !== 'Returned for Revision') {
      throw new Error(`Expected status 'Returned' ('Returned for Revision'), got ${returnedDoc.current_status} (${returnedDoc.statusLabel})`);
    }
    console.log(`   ✅ Status changed to: ${returnedDoc.current_status} (Label: "${returnedDoc.statusLabel}")`);
    console.log(`   ✅ Return reason recorded: "${returnedDoc.returnReason}"`);

    // -------------------------------------------------------------------------
    // 4️⃣ TC-PB22-4: Reason Appears to Requester and in Document History
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Visibility of Return Reason to Requester and in Audit History...');

    const requesterDocView = await request(`/documents/${docId}`, {
      method: 'GET',
      headers: studentHeaders,
    });
    if (requesterDocView.status !== 200) {
      throw new Error(`Requester could not view returned document: ${JSON.stringify(requesterDocView.body)}`);
    }
    if (requesterDocView.body.document.returnReason !== returnReasonText) {
      throw new Error(`Requester document view missing returnReason! Got: ${requesterDocView.body.document.returnReason}`);
    }
    console.log(`   ✅ Requester sees return reason on document: "${requesterDocView.body.document.returnReason}"`);
    console.log(`   ✅ Requester sees returning office: "${requesterDocView.body.document.returnInfo?.office}"`);

    const historyView = await request(`/documents/${docId}/history`, {
      method: 'GET',
      headers: studentHeaders,
    });
    if (historyView.status !== 200) {
      throw new Error(`Requester could not fetch history: ${JSON.stringify(historyView.body)}`);
    }
    const returnHistoryEntry = historyView.body.history.find(
      (h) => h.action_type === 'Returned' && h.action_remarks === returnReasonText
    );
    if (!returnHistoryEntry) {
      throw new Error('Return entry with exact reason not found in document history!');
    }
    console.log(`   ✅ Audit trail (Document_History) contains 'Returned' entry with remarks: "${returnHistoryEntry.action_remarks}"`);

    // -------------------------------------------------------------------------
    // 5️⃣ TC-PB22-5: Notification Follows Requester's Preference
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Notification Follows Requester Preference (Email / In_System / Both)...');

    if (!dispatchedNotif) {
      throw new Error('No notification was dispatched upon returning the document!');
    }
    if (dispatchedNotif.delivery_method !== 'Email' || !dispatchedNotif.channels.includes('email') || dispatchedNotif.channels.length !== 1) {
      throw new Error(`Expected notification delivery_method 'Email' for 'email_only' preference, got: ${JSON.stringify(dispatchedNotif)}`);
    }
    if (!dispatchedNotif.message.includes(returnReasonText)) {
      throw new Error(`Notification message does not include return reason: "${dispatchedNotif.message}"`);
    }
    console.log(`   ✅ Notification dispatched with delivery_method="${dispatchedNotif.delivery_method}" (Channels: [${dispatchedNotif.channels.join(', ')}])`);
    console.log(`   ✅ Notification message: "${dispatchedNotif.message}"`);

    // Restore student's preference back to 'both' and verify 'Both' delivery on a Secretary return
    await request('/documents/preferences', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ preference: 'both' }),
    });

    await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        remarks: 'Uploaded signed INC Completion Form.',
      }),
    });

    const secReturnReason = 'Attachment scan is blurry on page 2. Please upload a clearer scan.';
    const secReturnRes = await request(`/documents/${docId}/check`, {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({
        decision: 'return',
        reason: secReturnReason,
      }),
    });
    if (secReturnRes.status !== 200 || secReturnRes.body.notification?.delivery_method !== 'Both') {
      throw new Error(`Expected delivery_method 'Both' after updating preference to 'both', got: ${JSON.stringify(secReturnRes.body)}`);
    }
    console.log(`   ✅ After switching preference to 'both', notification dispatched with delivery_method="${secReturnRes.body.notification.delivery_method}" (Channels: [${secReturnRes.body.notification.channels.join(', ')}])`);

    console.log('\n================================================================');
    console.log('🎉 ALL PB-22 INTEGRATION TESTS PASSED (5 of 5)!');
    console.log('================================================================\n');
  } finally {
    for (const id of createdDocIds) {
      await DocumentModel.softDelete(id);
    }
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-22 Test Suite Failed:', err.message);
  process.exit(1);
});

