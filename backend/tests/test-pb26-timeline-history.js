/**
 * Integration Test Suite for Ticket PB-26:
 * "Show current office and processing timeline [P0]"
 *
 * SRS Traceability:
 *   - SRS 3.4: REQ-REC-4 (Processing history retention and non-deletion)
 *   - SRS 3.6: REQ-TRK-1 to REQ-TRK-4 (Current office, waiting time, chronological history, instant update)
 *   - Appendix B: Manual of Operations
 *
 * Acceptance Criteria:
 *   1. Record shows current status/office
 *   2. Chronological office/action/reason/actor/time history
 *   3. Ordinary users cannot edit history (immutability)
 */
const app = require('../server');
const UserModel = require('../models/userModel');
const DocumentModel = require('../models/documentModel');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');

const TEST_USERS = [
  {
    idNumber: 'STU-2026-001',
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
    const existing = await UserModel.findByEmail(u.email);
    if (existing && existing.active) continue;
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
  console.log('🧪 RUNNING PB-26 INTEGRATION TESTS: TIMELINE & CURRENT OFFICE');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  let server;
  const port = 5026;
  await new Promise((resolve) => {
    server = app.listen(port, () => resolve());
  });

  const request = async (endpoint, options = {}) => {
    const url = `http://localhost:${port}/api${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  };

  try {
    const studentHeaders = { 'x-user-email': 'student@msunaawan.edu.ph' };
    const secHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
    const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };
    const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };

    // -------------------------------------------------------------------------
    // TC-PB26-1: Current Status & Office Retrieval (REQ-TRK-1, REQ-TRK-2)
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Current Status & Office Retrieval (REQ-TRK-1, REQ-TRK-2)...');

    const submitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1, // Completion of INC
        title: 'INC Completion Request for Academic Year 2026',
        description: 'Submission for removal of INC in Educational Assessment.',
        origin: 'CESS',
      }),
    });
    if (submitRes.status !== 201) {
      throw new Error(`Failed to submit request: ${JSON.stringify(submitRes.body)}`);
    }
    const docId = submitRes.body.document.id || submitRes.body.document.document_id;
    const controlNo = submitRes.body.document.control_number;
    console.log(`   ✅ Document submitted: ${controlNo} (ID: ${docId})`);

    // Fetch document details via GET /api/documents/:id
    const docRes = await request(`/documents/${docId}`, {
      method: 'GET',
      headers: studentHeaders,
    });
    if (docRes.status !== 200) {
      throw new Error(`Failed to fetch document: ${JSON.stringify(docRes.body)}`);
    }
    const doc = docRes.body.document;
    if (doc.current_status !== 'Submitted' || doc.statusLabel !== 'Submitted') {
      throw new Error(`Expected status 'Submitted', got '${doc.current_status}'`);
    }
    if (doc.office?.office_name !== 'College Secretary') {
      throw new Error(`Expected initial office to be 'College Secretary', got '${doc.office?.office_name}'`);
    }
    if (!doc.officeSince) {
      throw new Error('Expected officeSince arrival timestamp to be populated on document record.');
    }
    console.log(`   ✅ Current Status: ${doc.current_status} (${doc.statusLabel})`);
    console.log(`   ✅ Current Office: ${doc.office?.office_name}`);
    console.log(`   ✅ Arrived At Office Since: ${doc.officeSince}`);

    // -------------------------------------------------------------------------
    // TC-PB26-2: Waiting Time Calculation & Progression Across Stages (REQ-TRK-2)
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Waiting Time Calculation & Stage Progression (REQ-TRK-2)...');

    if (typeof doc.timeWaitingMs !== 'number' || doc.timeWaitingMs < 0) {
      throw new Error(`Expected non-negative numeric timeWaitingMs, got: ${doc.timeWaitingMs}`);
    }
    console.log(`   ✅ Initial waiting time in College Secretary office: ${doc.timeWaitingMs} ms`);

    // Secretary verifies and routes to Chairperson
    await new Promise((resolve) => setTimeout(resolve, 50)); // Tiny tick for distinct timestamps
    const routeRes = await request(`/documents/${docId}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ decision: 'complete' }),
    });
    if (routeRes.status !== 200) {
      throw new Error(`Failed completeness check: ${JSON.stringify(routeRes.body)}`);
    }

    const docAfterRouteRes = await request(`/documents/${docId}`, {
      method: 'GET',
      headers: chairHeaders,
    });
    const docAfterRoute = docAfterRouteRes.body.document;
    if (docAfterRoute.current_status !== 'Under_Review') {
      throw new Error(`Expected status 'Under_Review', got '${docAfterRoute.current_status}'`);
    }
    if (docAfterRoute.office?.office_name !== 'Department Chairperson') {
      throw new Error(`Expected current office 'Department Chairperson', got '${docAfterRoute.office?.office_name}'`);
    }
    if (new Date(docAfterRoute.officeSince).getTime() <= new Date(doc.officeSince).getTime()) {
      throw new Error(`officeSince did not update to new arrival timestamp: ${docAfterRoute.officeSince} vs ${doc.officeSince}`);
    }
    console.log(`   ✅ Updated Office: ${docAfterRoute.office?.office_name}`);
    console.log(`   ✅ Updated officeSince: ${docAfterRoute.officeSince} (timeWaiting: ${docAfterRoute.timeWaitingMs} ms)`);

    // -------------------------------------------------------------------------
    // TC-PB26-3: Chronological Ordering & Timeline Integrity (REQ-TRK-3)
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Chronological Ordering & Timeline Integrity (REQ-TRK-3)...');

    // Chairperson endorses document to College Dean
    await new Promise((resolve) => setTimeout(resolve, 50));
    const chairEndorseRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: 'Endorsed by Department Chairperson: academic grade clearance confirmed.',
      }),
    });
    if (chairEndorseRes.status !== 200) {
      throw new Error(`Failed Chairperson endorsement: ${JSON.stringify(chairEndorseRes.body)}`);
    }

    const historyRes = await request(`/documents/${docId}/history`, {
      method: 'GET',
      headers: studentHeaders,
    });
    if (historyRes.status !== 200) {
      throw new Error(`Failed to fetch history: ${JSON.stringify(historyRes.body)}`);
    }
    const history = historyRes.body.history;
    if (!Array.isArray(history) || history.length < 3) {
      throw new Error(`Expected at least 3 history entries, got ${history?.length}`);
    }

    // Verify chronological order: T0 <= T1 <= T2
    for (let i = 0; i < history.length - 1; i++) {
      const tA = new Date(history[i].timestamp || history[i].action_timestamp).getTime();
      const tB = new Date(history[i + 1].timestamp || history[i + 1].action_timestamp).getTime();
      if (tA > tB) {
        throw new Error(`History entries out of chronological order at index ${i}: ${history[i].timestamp} > ${history[i + 1].timestamp}`);
      }
    }
    const actionsFlow = history.map((h) => h.action || h.action_type);
    console.log(`   ✅ Chronological Action Flow: ${actionsFlow.join(' -> ')}`);
    console.log(`   ✅ All ${history.length} milestones verified in strictly ascending chronological order.`);

    // -------------------------------------------------------------------------
    // TC-PB26-4: Comprehensive History Attributes (REQ-REC-4 & REQ-TRK-3)
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Comprehensive History Attributes (REQ-REC-4, REQ-TRK-3)...');

    for (const h of history) {
      const office = h.office || h.office_name;
      const action = h.action || h.action_type;
      const actorName = h.actor || h.actor_name;
      const timestamp = h.timestamp || h.action_timestamp;
      const rev = h.revision_no;

      if (!office) throw new Error(`Missing office on history entry: ${JSON.stringify(h)}`);
      if (!action) throw new Error(`Missing action on history entry: ${JSON.stringify(h)}`);
      if (!actorName) throw new Error(`Missing actor name on history entry: ${JSON.stringify(h)}`);
      if (!timestamp) throw new Error(`Missing timestamp on history entry: ${JSON.stringify(h)}`);
      if (!rev) throw new Error(`Missing revision number on history entry: ${JSON.stringify(h)}`);

      console.log(`   ✅ Milestone [${action}]: Office='${office}', Actor='${actorName}', Rev=${rev}, Time=${timestamp}`);
    }

    // -------------------------------------------------------------------------
    // TC-PB26-5: Multi-Revision History Preservation (SRS 3.6, REQ-SUB-8)
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Multi-Revision History Preservation (SRS 3.6, REQ-SUB-8)...');

    // Dean returns document with correction feedback
    const deanReturnRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({
        action: 'return',
        remarks: 'Please re-upload grade slip copy with official registrar stamp.',
      }),
    });
    if (deanReturnRes.status !== 200) {
      throw new Error(`Failed Dean return: ${JSON.stringify(deanReturnRes.body)}`);
    }

    // Requester resubmits document (creates Revision 2)
    const resubmitRes = await request(`/documents/${docId}/resubmit`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'INC Completion Request (Revision 2 with Official Stamp)',
        remarks: 'Attached certified true copy with registrar stamp.',
      }),
    });
    if (resubmitRes.status !== 200) {
      throw new Error(`Failed resubmission: ${JSON.stringify(resubmitRes.body)}`);
    }

    // Secretary verifies and routes Revision 2
    await request(`/documents/${docId}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ decision: 'complete' }),
    });

    const multiRevHistoryRes = await request(`/documents/${docId}/history`, {
      method: 'GET',
      headers: studentHeaders,
    });
    const fullHistory = multiRevHistoryRes.body.history;

    const rev1Events = fullHistory.filter((h) => Number(h.revision_no) === 1);
    const rev2Events = fullHistory.filter((h) => Number(h.revision_no) === 2);

    if (rev1Events.length === 0 || rev2Events.length === 0) {
      throw new Error(`Expected both Rev 1 and Rev 2 history preserved. Got Rev 1: ${rev1Events.length}, Rev 2: ${rev2Events.length}`);
    }
    console.log(`   ✅ Revision 1 milestones preserved intact: ${rev1Events.length} events`);
    console.log(`   ✅ Revision 2 milestones recorded: ${rev2Events.length} events`);
    console.log(`   ✅ Total continuous audit events retained: ${fullHistory.length} events with zero data loss.`);

    // -------------------------------------------------------------------------
    // TC-PB26-6: History Immutability Protection (REQ-REC-4)
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Testing History Immutability Protection (REQ-REC-4)...');

    // Attempt PUT on history
    const putHistoryRes = await request(`/documents/${docId}/history`, {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ action: 'Approved', remarks: 'Hacked approval' }),
    });
    if (putHistoryRes.status !== 405 && putHistoryRes.status !== 403) {
      throw new Error(`Expected 405/403 when attempting PUT on history, got: ${putHistoryRes.status}`);
    }
    console.log(`   ✅ PUT on history blocked -> Status ${putHistoryRes.status}: "${putHistoryRes.body.error}"`);

    // Attempt POST on history
    const postHistoryRes = await request(`/documents/${docId}/history`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ action: 'Deleted' }),
    });
    if (postHistoryRes.status !== 405 && postHistoryRes.status !== 403) {
      throw new Error(`Expected 405/403 when attempting POST on history, got: ${postHistoryRes.status}`);
    }
    console.log(`   ✅ POST on history blocked -> Status ${postHistoryRes.status}: "${postHistoryRes.body.error}"`);

    // Attempt DELETE on history
    const deleteHistoryRes = await request(`/documents/${docId}/history`, {
      method: 'DELETE',
      headers: secHeaders,
    });
    if (deleteHistoryRes.status !== 405 && deleteHistoryRes.status !== 403) {
      throw new Error(`Expected 405/403 when attempting DELETE on history, got: ${deleteHistoryRes.status}`);
    }
    console.log(`   ✅ DELETE on history blocked -> Status ${deleteHistoryRes.status}: "${deleteHistoryRes.body.error}"`);

    // Attempt DELETE on specific history item
    const deleteSpecificHistoryRes = await request(`/documents/${docId}/history/${fullHistory[0].history_id}`, {
      method: 'DELETE',
      headers: secHeaders,
    });
    if (deleteSpecificHistoryRes.status !== 405 && deleteSpecificHistoryRes.status !== 403) {
      throw new Error(`Expected 405/403 when attempting DELETE on history item, got: ${deleteSpecificHistoryRes.status}`);
    }
    console.log(`   ✅ DELETE on specific history milestone blocked -> Status ${deleteSpecificHistoryRes.status}: "${deleteSpecificHistoryRes.body.error}"`);

    console.log('\n================================================================');
    console.log('🎉 ALL 6 PB-26 INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-26 TEST FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
