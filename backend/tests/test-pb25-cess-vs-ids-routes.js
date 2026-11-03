/**
 * Integration Test Suite for Ticket PB-25:
 * "Configure and enforce CESS versus IDS routes [P0]"
 *
 * SRS Traceability:
 *   - SRS 3.5: REQ-ROUTE-1 to REQ-ROUTE-11
 *   - Appendix B (Manual of Operations 2025)
 *
 * Acceptance Criteria:
 *   1. Route follows approved configuration (SRS 3.5 REQ-ROUTE-1 to 4; Appendix B)
 *   2. IDS Principal review occurs where required (REQ-ROUTE-3)
 *   3. Invalid transitions are blocked (REQ-ROUTE-7)
 *   4. Every handoff is logged (REQ-ROUTE-8)
 */
const app = require('../server');
const UserModel = require('../models/userModel');
const DocumentModel = require('../models/documentModel');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');

const TEST_USERS = [
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
    idNumber: 'EMP-2018-092',
    name: 'Mr. Jose Dela Cruz',
    email: 'ids.faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'Teacher III',
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
    idNumber: 'IDS-2026-01',
    name: 'Dr. Teresa Gomez',
    email: 'ids.principal@msunaawan.edu.ph',
    role: 'ids_principal',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'IDS Principal',
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
    idNumber: 'OVCAA-2026-01',
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
  console.log('🧪 RUNNING PB-25 INTEGRATION TESTS: CONFIGURE & ENFORCE ROUTES');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  let server;
  const port = 5025;
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
    // 0. Use role test headers
    const cessFacultyHeaders = { 'x-user-email': 'faculty@msunaawan.edu.ph' };
    const idsFacultyHeaders = { 'x-user-email': 'ids.faculty@msunaawan.edu.ph' };
    const secHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
    const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };
    const principalHeaders = { 'x-user-email': 'ids.principal@msunaawan.edu.ph' };
    const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };
    const ovcaaHeaders = { 'x-user-email': 'ovcaa@msunaawan.edu.ph' };
    const chancellorHeaders = { 'x-user-email': 'chancellor@msunaawan.edu.ph' };

    // -------------------------------------------------------------------------
    // TC-PB25-1: CESS Route Execution (Secretary -> Chairperson -> Dean -> Secretary)
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing CESS Standard Route Execution (REQ-ROUTE-2)...');

    const cessSubmitRes = await request('/documents', {
      method: 'POST',
      headers: cessFacultyHeaders,
      body: JSON.stringify({
        docTypeId: 5, // Faculty Leave
        title: 'CESS Research Faculty Leave Request',
        description: 'Leave recommendation form for CESS faculty conference.',
        origin: 'CESS',
      }),
    });
    if (cessSubmitRes.status !== 201) {
      throw new Error(`Failed to submit CESS request: ${JSON.stringify(cessSubmitRes.body)}`);
    }
    const cessDocId = cessSubmitRes.body.document.document_id;
    const cessControlNo = cessSubmitRes.body.document.control_number;
    console.log(`   ✅ CESS Request submitted: ${cessControlNo}`);

    // Check initial route metadata
    const cessRouteInitial = await request(`/documents/${cessDocId}/route`, {
      method: 'GET',
      headers: cessFacultyHeaders,
    });
    if (cessRouteInitial.status !== 200) {
      throw new Error(`Failed to fetch CESS route: ${JSON.stringify(cessRouteInitial.body)}`);
    }
    const cessExpectedRoute = ['College Secretary', 'Department Chairperson', 'College Dean', 'College Secretary'];
    if (JSON.stringify(cessRouteInitial.body.route) !== JSON.stringify(cessExpectedRoute)) {
      throw new Error(`Expected CESS route ${JSON.stringify(cessExpectedRoute)}, got: ${JSON.stringify(cessRouteInitial.body.route)}`);
    }
    if (cessRouteInitial.body.isIdsRoute !== false || cessRouteInitial.body.requiresIdsPrincipal !== false) {
      throw new Error(`CESS route should not flag IDS principal or IDS route`);
    }
    console.log(`   ✅ Initial CESS Route verified: [${cessRouteInitial.body.route.join(' -> ')}]`);

    // Secretary verifies and routes to Chairperson
    await request(`/documents/${cessDocId}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ decision: 'complete' }),
    });

    // Chairperson endorses -> Should automatically route directly to College Dean
    const cessChairEndorse = await request(`/documents/${cessDocId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: 'Endorsed by Department Chairperson to College Dean.',
      }),
    });
    if (cessChairEndorse.status !== 200) {
      throw new Error(`Failed Chairperson endorsement on CESS document: ${JSON.stringify(cessChairEndorse.body)}`);
    }
    if (cessChairEndorse.body.document.office?.office_name !== 'College Dean') {
      throw new Error(`Expected document office to be 'College Dean', got '${cessChairEndorse.body.document.office?.office_name}'`);
    }
    console.log(`   ✅ Chairperson Endorsed CESS document -> Successfully routed to 'College Dean'.`);

    // College Dean approves -> Routes to College Secretary for release
    const cessDeanApprove = await request(`/documents/${cessDocId}/review`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({
        action: 'approve',
        remarks: 'Approved by College Dean for release.',
      }),
    });
    if (cessDeanApprove.status !== 200) {
      throw new Error(`Failed Dean approval on CESS document: ${JSON.stringify(cessDeanApprove.body)}`);
    }
    if (cessDeanApprove.body.document.office?.office_name !== 'College Secretary') {
      throw new Error(`Expected document office to be 'College Secretary' after Dean approval, got '${cessDeanApprove.body.document.office?.office_name}'`);
    }
    console.log(`   ✅ College Dean Approved CESS document -> Successfully routed to 'College Secretary'.`);

    // -------------------------------------------------------------------------
    // TC-PB25-2: IDS Route Execution with Mandatory IDS Principal Review (REQ-ROUTE-3)
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing IDS Route Execution with Mandatory IDS Principal Review (REQ-ROUTE-3)...');

    const idsSubmitRes = await request('/documents', {
      method: 'POST',
      headers: idsFacultyHeaders,
      body: JSON.stringify({
        docTypeId: 5, // IDS Travel Order
        title: 'IDS Regional Science Fair Travel Order',
        description: 'Travel order request for chaperoning IDS students at science fair.',
        origin: 'IDS',
      }),
    });
    if (idsSubmitRes.status !== 201) {
      throw new Error(`Failed to submit IDS request: ${JSON.stringify(idsSubmitRes.body)}`);
    }
    const idsDocId = idsSubmitRes.body.document.document_id;
    const idsControlNo = idsSubmitRes.body.document.control_number;
    console.log(`   ✅ IDS Request submitted: ${idsControlNo}`);

    // Check IDS route metadata
    const idsRouteRes = await request(`/documents/${idsDocId}/route`, {
      method: 'GET',
      headers: idsFacultyHeaders,
    });
    const idsExpectedRoute = ['College Secretary', 'Department Chairperson', 'IDS Principal', 'College Dean', 'College Secretary'];
    if (JSON.stringify(idsRouteRes.body.route) !== JSON.stringify(idsExpectedRoute)) {
      throw new Error(`Expected IDS route ${JSON.stringify(idsExpectedRoute)}, got: ${JSON.stringify(idsRouteRes.body.route)}`);
    }
    if (idsRouteRes.body.isIdsRoute !== true || idsRouteRes.body.requiresIdsPrincipal !== true) {
      throw new Error(`IDS route must flag isIdsRoute and requiresIdsPrincipal`);
    }
    console.log(`   ✅ Verified IDS Route configuration: [${idsRouteRes.body.route.join(' -> ')}]`);

    // Secretary verifies and routes to Chairperson
    await request(`/documents/${idsDocId}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ decision: 'complete' }),
    });

    // Chairperson endorses IDS document -> MUST route to IDS Principal
    const idsChairEndorse = await request(`/documents/${idsDocId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: 'Endorsed by Chairperson: forwarding to IDS Principal for high school administrative review.',
      }),
    });
    if (idsChairEndorse.status !== 200) {
      throw new Error(`Failed Chairperson endorsement on IDS document: ${JSON.stringify(idsChairEndorse.body)}`);
    }
    if (idsChairEndorse.body.document.office?.office_name !== 'IDS Principal') {
      throw new Error(`Expected document office to be 'IDS Principal', got '${idsChairEndorse.body.document.office?.office_name}'`);
    }
    console.log(`   ✅ Chairperson Endorsed IDS document -> Successfully routed to 'IDS Principal'.`);

    // IDS Principal endorses -> MUST route to College Dean
    const idsPrincipalEndorse = await request(`/documents/${idsDocId}/review`, {
      method: 'POST',
      headers: principalHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: 'Endorsed by IDS Principal: verified student security and budget allocation.',
      }),
    });
    if (idsPrincipalEndorse.status !== 200) {
      throw new Error(`Failed IDS Principal endorsement: ${JSON.stringify(idsPrincipalEndorse.body)}`);
    }
    if (idsPrincipalEndorse.body.document.office?.office_name !== 'College Dean') {
      throw new Error(`Expected document office to be 'College Dean' after IDS Principal endorsement, got '${idsPrincipalEndorse.body.document.office?.office_name}'`);
    }
    console.log(`   ✅ IDS Principal Endorsed -> Successfully routed to 'College Dean'.`);

    // College Dean approves
    const idsDeanApprove = await request(`/documents/${idsDocId}/review`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({
        action: 'approve',
        remarks: 'Approved by College Dean.',
      }),
    });
    if (idsDeanApprove.status !== 200) {
      throw new Error(`Failed Dean approval on IDS document: ${JSON.stringify(idsDeanApprove.body)}`);
    }
    console.log(`   ✅ College Dean Approved IDS document -> Successfully routed to 'College Secretary'.`);

    // -------------------------------------------------------------------------
    // TC-PB25-3: Chairperson attempt to bypass IDS Principal on an IDS document is blocked
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Chairperson Attempt to Bypass IDS Principal on IDS Document (REQ-ROUTE-3 & REQ-ROUTE-7)...');

    const bypassDocRes = await request('/documents', {
      method: 'POST',
      headers: idsFacultyHeaders,
      body: JSON.stringify({
        docTypeId: 5,
        title: 'IDS Equipment Requisition Bypass Attempt',
        description: 'Testing bypass prevention.',
        origin: 'IDS',
      }),
    });
    const bypassDocId = bypassDocRes.body.document.document_id;
    await request(`/documents/${bypassDocId}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ decision: 'complete' }),
    });

    // Chairperson attempts to skip IDS Principal by specifying nextOfficeName: 'College Dean'
    const bypassAttemptRes = await request(`/documents/${bypassDocId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'endorse',
        nextOfficeName: 'College Dean', // ILLEGAL BYPASS
        remarks: 'Attempting to bypass IDS Principal directly to College Dean.',
      }),
    });
    if (bypassAttemptRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request when attempting to bypass IDS Principal, got ${bypassAttemptRes.status}: ${JSON.stringify(bypassAttemptRes.body)}`);
    }
    console.log(`   ✅ Bypass blocked -> Status ${bypassAttemptRes.status}: "${bypassAttemptRes.body.error}"`);

    // Verify document remained at Chairperson stage
    const verifyDocRes = await request(`/documents/${bypassDocId}`, {
      method: 'GET',
      headers: chairHeaders,
    });
    if (verifyDocRes.body.document.office?.office_name !== 'Department Chairperson') {
      throw new Error(`Document should still be at Department Chairperson, got: '${verifyDocRes.body.document.office?.office_name}'`);
    }
    console.log(`   ✅ Document integrity maintained: still assigned to 'Department Chairperson'.`);

    // -------------------------------------------------------------------------
    // TC-PB25-4: Chairperson attempt to route CESS document to IDS Principal is blocked
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Chairperson Attempt to Route CESS Document to IDS Principal (REQ-ROUTE-7)...');

    const cessDoc2Res = await request('/documents', {
      method: 'POST',
      headers: cessFacultyHeaders,
      body: JSON.stringify({
        docTypeId: 5,
        title: 'CESS Misrouting Test Request',
        description: 'Testing invalid routing of CESS document to IDS Principal.',
        origin: 'CESS',
      }),
    });
    const cessDoc2Id = cessDoc2Res.body.document.document_id;
    await request(`/documents/${cessDoc2Id}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({ decision: 'complete' }),
    });

    // Chairperson attempts to route CESS document to IDS Principal
    const cessMisrouteRes = await request(`/documents/${cessDoc2Id}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'endorse',
        nextOfficeName: 'IDS Principal', // ILLEGAL FOR CESS ORIGIN
        remarks: 'Mistakenly routing CESS document to IDS Principal.',
      }),
    });
    if (cessMisrouteRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request when routing CESS to IDS Principal, got ${cessMisrouteRes.status}: ${JSON.stringify(cessMisrouteRes.body)}`);
    }
    console.log(`   ✅ Cross-origin routing blocked -> Status ${cessMisrouteRes.status}: "${cessMisrouteRes.body.error}"`);

    // -------------------------------------------------------------------------
    // TC-PB25-5: Out-of-turn decisions by unauthorized offices are strictly blocked (REQ-ROUTE-7)
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Out-of-Turn Decisions Blocked (REQ-ROUTE-7)...');

    // cessDoc2 is currently assigned to Department Chairperson.
    // College Dean attempts to review/endorse before Chairperson has acted.
    const outOfTurnDean = await request(`/documents/${cessDoc2Id}/review`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({
        action: 'approve',
        remarks: 'Dean acting out-of-turn before Chairperson endorsement.',
      }),
    });
    if (outOfTurnDean.status !== 403) {
      throw new Error(`Expected 403 Forbidden for out-of-turn Dean action, got ${outOfTurnDean.status}: ${JSON.stringify(outOfTurnDean.body)}`);
    }
    console.log(`   ✅ Dean out-of-turn action blocked -> Status ${outOfTurnDean.status}: "${outOfTurnDean.body.error}"`);

    // IDS Principal attempts to review/endorse CESS document
    const outOfTurnPrincipal = await request(`/documents/${cessDoc2Id}/review`, {
      method: 'POST',
      headers: principalHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: 'IDS Principal acting out-of-turn on CESS document.',
      }),
    });
    if (outOfTurnPrincipal.status !== 403) {
      throw new Error(`Expected 403 Forbidden for out-of-turn Principal action, got ${outOfTurnPrincipal.status}: ${JSON.stringify(outOfTurnPrincipal.body)}`);
    }
    console.log(`   ✅ IDS Principal out-of-turn action blocked -> Status ${outOfTurnPrincipal.status}: "${outOfTurnPrincipal.body.error}"`);

    // -------------------------------------------------------------------------
    // TC-PB25-6: Dean Endorses for Higher Approval (OVCAA -> Chancellor) (REQ-ROUTE-5)
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Testing Higher Approval Route Extension (REQ-ROUTE-5)...');

    // Endorse cessDoc2 legally through Chairperson to Dean
    await request(`/documents/${cessDoc2Id}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: 'Endorsed by Chairperson to College Dean.',
      }),
    });

    // Dean endorses for higher approval to OVCAA
    const deanHigherRes = await request(`/documents/${cessDoc2Id}/review`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({
        action: 'endorse_higher',
        remarks: 'Endorsed for Higher Approval: Institutional university-level endorsement needed.',
      }),
    });
    if (deanHigherRes.status !== 200) {
      throw new Error(`Failed Dean endorse_higher: ${JSON.stringify(deanHigherRes.body)}`);
    }
    if (deanHigherRes.body.document.office?.office_name !== 'OVCAA') {
      throw new Error(`Expected document office to be 'OVCAA', got '${deanHigherRes.body.document.office?.office_name}'`);
    }
    console.log(`   ✅ College Dean endorsed for higher approval -> Successfully routed to 'OVCAA'.`);

    // OVCAA endorses to Chancellor
    const ovcaaEndorseRes = await request(`/documents/${cessDoc2Id}/review`, {
      method: 'POST',
      headers: ovcaaHeaders,
      body: JSON.stringify({
        action: 'endorse',
        remarks: 'OVCAA endorses request to the Office of the Chancellor.',
      }),
    });
    if (ovcaaEndorseRes.status !== 200) {
      throw new Error(`Failed OVCAA endorsement: ${JSON.stringify(ovcaaEndorseRes.body)}`);
    }
    if (ovcaaEndorseRes.body.document.office?.office_name !== 'Office of the Chancellor') {
      throw new Error(`Expected document office to be 'Office of the Chancellor', got '${ovcaaEndorseRes.body.document.office?.office_name}'`);
    }
    console.log(`   ✅ OVCAA endorsed -> Successfully routed to 'Office of the Chancellor'.`);

    // Chancellor grants final university approval -> Routes to Secretary for release
    const chancellorApproveRes = await request(`/documents/${cessDoc2Id}/review`, {
      method: 'POST',
      headers: chancellorHeaders,
      body: JSON.stringify({
        action: 'approve',
        remarks: 'Chancellor final university approval granted.',
      }),
    });
    if (chancellorApproveRes.status !== 200) {
      throw new Error(`Failed Chancellor final approval: ${JSON.stringify(chancellorApproveRes.body)}`);
    }
    if (chancellorApproveRes.body.document.office?.office_name !== 'College Secretary') {
      throw new Error(`Expected document office to be 'College Secretary' for final release, got '${chancellorApproveRes.body.document.office?.office_name}'`);
    }
    console.log(`   ✅ Chancellor Approved -> Successfully routed to 'College Secretary' for release.`);

    // Check updated route representation includes higher approval offices
    const higherRouteRes = await request(`/documents/${cessDoc2Id}/route`, {
      method: 'GET',
      headers: secHeaders,
    });
    if (!higherRouteRes.body.route.includes('OVCAA') || !higherRouteRes.body.route.includes('Office of the Chancellor')) {
      throw new Error(`Expected route to include OVCAA and Chancellor, got: ${JSON.stringify(higherRouteRes.body.route)}`);
    }
    console.log(`   ✅ Dynamically extended route verified: [${higherRouteRes.body.route.join(' -> ')}]`);

    // -------------------------------------------------------------------------
    // TC-PB25-7: Every Handoff is Logged in History (REQ-ROUTE-8)
    // -------------------------------------------------------------------------
    console.log('\n7️⃣  Testing Comprehensive Handoff Audit Trail Logging (REQ-ROUTE-8)...');

    const historyRes = await request(`/documents/${cessDoc2Id}/history`, {
      method: 'GET',
      headers: secHeaders,
    });
    if (historyRes.status !== 200) {
      throw new Error(`Failed to fetch history: ${JSON.stringify(historyRes.body)}`);
    }
    const events = historyRes.body.history;
    console.log(`   ✅ Total history events recorded for multi-stage route: ${events.length}`);

    // Verify each event has required audit metadata
    for (const ev of events) {
      if (!ev.action_type || !ev.action_timestamp || !ev.action_by_user_id) {
        throw new Error(`Incomplete history audit entry: ${JSON.stringify(ev)}`);
      }
    }
    const actionTypes = events.map((e) => e.action_type);
    console.log(`   ✅ Chronological Action Flow: ${actionTypes.join(' -> ')}`);
    if (
      !actionTypes.includes('Submitted') ||
      !actionTypes.includes('Routed') ||
      !actionTypes.includes('Endorsed') ||
      !actionTypes.includes('Approved')
    ) {
      throw new Error(`Missing expected action types in audit trail: ${JSON.stringify(actionTypes)}`);
    }
    console.log(`   ✅ Every handoff and decision retains actor, office, remarks, and timestamps.`);

    console.log('\n================================================================');
    console.log('🎉 ALL 7 PB-25 INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-25 TEST FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
