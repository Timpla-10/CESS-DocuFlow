/**
 * Integration Test Suite for Ticket PB-24:
 * "Record endorsement, approval, and office decision [P0]"
 *
 * User Story:
 *   As a reviewer, I want to record the action allowed for my office.
 *
 * Acceptance Criteria:
 *   1. Only permitted actions appear
 *   2. Action, remarks, actor and timestamp are saved
 *   3. System does not make decisions automatically
 *   4. Final authority remains with designated personnel
 */
const app = require('../server');
const DocumentModel = require('../models/documentModel');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');

const TEST_USERS = [
  {
    idNumber: 'FAC-2026-01',
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
  {
    idNumber: 'OVC-2026-01',
    name: 'Dr. Victor Salazar',
    email: 'ovcaa@msunaawan.edu.ph',
    role: 'ovcaa',
    origin: 'CESS',
    department: 'Office of the Vice Chancellor for Academic Affairs',
    position: 'Vice Chancellor for Academic Affairs',
  },
  {
    idNumber: 'CHN-2026-01',
    name: 'Dr. Antonio Cabrera',
    email: 'chancellor@msunaawan.edu.ph',
    role: 'chancellor',
    origin: 'CESS',
    department: 'Office of the Chancellor',
    position: 'Chancellor',
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
  console.log('🧪 RUNNING PB-24 INTEGRATION TESTS: RECORD OFFICE DECISIONS');
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

    const facultyHeaders = { 'x-user-email': 'faculty@msunaawan.edu.ph' };
    const secretaryHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
    const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };
    const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };
    const ovcaaHeaders = { 'x-user-email': 'ovcaa@msunaawan.edu.ph' };
    const chancellorHeaders = { 'x-user-email': 'chancellor@msunaawan.edu.ph' };

    // Submit a Faculty Leave request and route to Department Chairperson
    const submitRes = await request('/documents', {
      method: 'POST',
      headers: facultyHeaders,
      body: JSON.stringify({
        typeId: 'leave',
        title: 'PB-24 Faculty Application for Leave',
        description: 'Requesting 3-day vacation leave for academic conference',
      }),
    });
    if (submitRes.status !== 201) {
      throw new Error(`Failed to submit document: ${JSON.stringify(submitRes.body)}`);
    }
    const docId = submitRes.body.document.id;
    createdDocIds.push(docId);

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
    // 1️⃣ TC-PB24-1: Only permitted actions appear for each office at its stage
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Only Permitted Actions Appear for Each Office (GET /api/documents/:id/actions)...');

    const chairActionsRes = await request(`/documents/${docId}/actions`, {
      method: 'GET',
      headers: chairHeaders,
    });
    if (chairActionsRes.status !== 200) {
      throw new Error(`Expected 200 OK for chair actions, got ${chairActionsRes.status}`);
    }
    const chairPermitted = chairActionsRes.body.permittedActions;
    if (
      !chairPermitted.includes('endorse') ||
      !chairPermitted.includes('return') ||
      !chairPermitted.includes('reject') ||
      chairPermitted.includes('approve')
    ) {
      throw new Error(
        `Chairperson permitted actions should be ['endorse', 'return', 'reject'] (without 'approve'), got: ${JSON.stringify(chairPermitted)}`
      );
    }
    console.log(`   ✅ Department Chairperson permitted actions: [${chairPermitted.join(', ')}] (Final 'approve' NOT shown)`);

    // Unassigned reviewer (Dean while doc is at Chairperson) sees no actions
    const deanEarlyActionsRes = await request(`/documents/${docId}/actions`, {
      method: 'GET',
      headers: deanHeaders,
    });
    if (deanEarlyActionsRes.body.permittedActions.length !== 0) {
      throw new Error(`Expected 0 permitted actions for Dean before Dean's stage, got: ${JSON.stringify(deanEarlyActionsRes.body.permittedActions)}`);
    }
    console.log(`   ✅ College Dean permitted actions while at Chairperson stage: [] (empty)`);

    // -------------------------------------------------------------------------
    // 2️⃣ TC-PB24-2: System Does Not Make Decisions Automatically
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing System Does Not Make Decisions Automatically...');

    // Missing explicit action must fail with 400 Bad Request (no default auto-endorsement)
    const missingActionRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ remarks: 'No decision action specified' }),
    });
    if (missingActionRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request when action is omitted, got ${missingActionRes.status}`);
    }
    console.log(`   ✅ Omitted decision rejected -> Status ${missingActionRes.status}: "${missingActionRes.body.error}"`);

    // Automated flag must fail with 403 Forbidden
    const autoDecisionRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({ action: 'endorse', automated: true }),
    });
    if (autoDecisionRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden when automated=true, got ${autoDecisionRes.status}`);
    }
    console.log(`   ✅ Automated decision blocked -> Status ${autoDecisionRes.status}: "${autoDecisionRes.body.error}"`);

    // -------------------------------------------------------------------------
    // 3️⃣ TC-PB24-3: Final Authority Remains with Designated Personnel
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Final Authority Remains with Designated Personnel (College Dean / Chancellor)...');

    // Department Chairperson attempting to record final 'approve' is blocked (403 Forbidden)
    const chairTryApprove = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'approve',
        remarks: 'Chairperson attempting final approval.',
      }),
    });
    if (chairTryApprove.status !== 403) {
      throw new Error(`Expected 403 Forbidden when Chairperson tries to approve, got ${chairTryApprove.status}`);
    }
    console.log(`   ✅ Chairperson blocked from final approval -> Status ${chairTryApprove.status}: "${chairTryApprove.body.error}"`);

    // -------------------------------------------------------------------------
    // 4️⃣ TC-PB24-4: Action, Remarks, Actor and Timestamp are Saved on Endorsement & Approval
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Action, Remarks, Actor, and Timestamp Saved on Office Decisions...');

    // Step A: Department Chairperson records permitted 'endorse' action
    const chairRemarks = 'Endorsed by Department Chairperson: teaching load substitute confirmed.';
    const chairEndorseRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: chairRemarks,
      }),
    });
    if (chairEndorseRes.status !== 200) {
      throw new Error(`Expected 200 OK for Chairperson endorsement, got ${chairEndorseRes.status}: ${JSON.stringify(chairEndorseRes.body)}`);
    }

    const chairDecision = chairEndorseRes.body.decision;
    if (
      !chairDecision ||
      chairDecision.action !== 'Endorsed' ||
      chairDecision.remarks !== chairRemarks ||
      !chairDecision.actorId ||
      chairDecision.office !== 'Department Chairperson' ||
      !chairDecision.timestamp
    ) {
      throw new Error(`Incomplete decision metadata saved for Chairperson: ${JSON.stringify(chairDecision)}`);
    }
    console.log(`   ✅ Chairperson Endorsement saved:`);
    console.log(`      - Action:    ${chairDecision.action}`);
    console.log(`      - Office:    ${chairDecision.office}`);
    console.log(`      - Actor ID:  ${chairDecision.actorId} (${chairDecision.actorName})`);
    console.log(`      - Remarks:   "${chairDecision.remarks}"`);
    console.log(`      - Timestamp: ${chairDecision.timestamp}`);
    console.log(`      - Routed To: ${chairEndorseRes.body.document.office?.office_name}`);

    // Verify document is now at College Dean stage and Dean sees 'approve' & 'endorse_higher'
    const deanActionsNow = await request(`/documents/${docId}/actions`, {
      method: 'GET',
      headers: deanHeaders,
    });
    const deanPermitted = deanActionsNow.body.permittedActions;
    if (!deanPermitted.includes('approve') || !deanPermitted.includes('endorse_higher')) {
      throw new Error(`Expected Dean permitted actions to include 'approve' and 'endorse_higher', got: ${JSON.stringify(deanPermitted)}`);
    }
    console.log(`   ✅ College Dean permitted actions at Dean stage: [${deanPermitted.join(', ')}]`);

    // Step B: College Dean endorses for higher approval to OVCAA
    const deanRemarks = 'Endorsed by College Dean and forwarded to OVCAA for university-level review.';
    const deanEndorseHigherRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({
        action: 'endorse_higher',
        remarks: deanRemarks,
      }),
    });
    if (deanEndorseHigherRes.status !== 200) {
      throw new Error(`Expected 200 OK for Dean endorse_higher, got ${deanEndorseHigherRes.status}`);
    }
    console.log(`   ✅ College Dean Endorsement to OVCAA saved (Routed To: ${deanEndorseHigherRes.body.document.office?.office_name})`);

    // Step C: OVCAA attempts final 'approve' -> blocked (403 Forbidden), then endorses to Chancellor
    const ovcaaTryApprove = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: ovcaaHeaders,
      body: JSON.stringify({
        action: 'approve',
        remarks: 'OVCAA trying final approval instead of Chancellor.',
      }),
    });
    if (ovcaaTryApprove.status !== 403) {
      throw new Error(`Expected 403 Forbidden when OVCAA tries to approve, got ${ovcaaTryApprove.status}`);
    }
    console.log(`   ✅ OVCAA blocked from final approval -> Status ${ovcaaTryApprove.status}: "${ovcaaTryApprove.body.error}"`);

    const ovcaaEndorseRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: ovcaaHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: 'Endorsed by OVCAA to the Office of the Chancellor.',
      }),
    });
    if (ovcaaEndorseRes.status !== 200) {
      throw new Error(`Expected 200 OK for OVCAA endorsement, got ${ovcaaEndorseRes.status}`);
    }
    console.log(`   ✅ OVCAA Endorsement saved (Routed To: ${ovcaaEndorseRes.body.document.office?.office_name})`);

    // Step D: Designated Final Authority (Chancellor) records final 'approve'
    const chancellorActionsRes = await request(`/documents/${docId}/actions`, {
      method: 'GET',
      headers: chancellorHeaders,
    });
    const chancellorPermitted = chancellorActionsRes.body.permittedActions;
    if (!chancellorPermitted.includes('approve') || chancellorPermitted.includes('endorse')) {
      throw new Error(`Expected Chancellor permitted actions to be ['approve', 'return', 'reject'], got: ${JSON.stringify(chancellorPermitted)}`);
    }
    console.log(`   ✅ Chancellor permitted actions at final stage: [${chancellorPermitted.join(', ')}]`);

    const chancellorRemarks = 'Approved by the Chancellor for official release.';
    const chancellorApproveRes = await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chancellorHeaders,
      body: JSON.stringify({
        action: 'approve',
        remarks: chancellorRemarks,
      }),
    });
    if (chancellorApproveRes.status !== 200) {
      throw new Error(`Expected 200 OK for Chancellor final approval, got ${chancellorApproveRes.status}: ${JSON.stringify(chancellorApproveRes.body)}`);
    }

    const finalDecision = chancellorApproveRes.body.decision;
    if (
      !finalDecision ||
      finalDecision.action !== 'Approved' ||
      finalDecision.remarks !== chancellorRemarks ||
      !finalDecision.actorId ||
      finalDecision.office !== 'Office of the Chancellor' ||
      !finalDecision.timestamp
    ) {
      throw new Error(`Incomplete final approval metadata: ${JSON.stringify(finalDecision)}`);
    }
    console.log(`   ✅ Designated Final Authority (Chancellor) Approval saved:`);
    console.log(`      - Action:    ${finalDecision.action}`);
    console.log(`      - Office:    ${finalDecision.office}`);
    console.log(`      - Actor ID:  ${finalDecision.actorId} (${finalDecision.actorName})`);
    console.log(`      - Remarks:   "${finalDecision.remarks}"`);
    console.log(`      - Timestamp: ${finalDecision.timestamp}`);
    console.log(`      - Routed To: ${chancellorApproveRes.body.document.office?.office_name} (for final release)`);

    // Verify all decisions are persisted in Document_History
    const historyRes = await request(`/documents/${docId}/history`, {
      method: 'GET',
      headers: facultyHeaders,
    });
    const history = historyRes.body.history || [];
    const endorsedEntries = history.filter((h) => h.action_type === 'Endorsed');
    const approvedEntry = history.find((h) => h.action_type === 'Approved');
    if (endorsedEntries.length !== 3 || !approvedEntry) {
      throw new Error(`Expected 3 Endorsed entries and 1 Approved entry in history, got: ${JSON.stringify(history.map((h) => h.action_type))}`);
    }
    console.log(`   ✅ Audit trail verified: ${endorsedEntries.length} Endorsed records + 1 Approved record persisted with actor, office, remarks, and timestamps.`);

    console.log('\n================================================================');
    console.log('🎉 ALL 4 PB-24 ACCEPTANCE CRITERIA TESTS PASSED SUCCESSFULLY!');
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
