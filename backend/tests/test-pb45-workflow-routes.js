/**
 * Automated Integration Test Suite for Ticket PB-45:
 * "Configure workflow routes and status transitions [P0]"
 * Traceability: SRS 3.5 (REQ-ROUTE-1..5); SRS revision history 1.3
 * PO/Team Note: "Changes affect new requests only."
 */
const assert = require('assert');
const app = require('../server');
const supabase = require('../config/database');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');
const DocumentModel = require('../models/documentModel');
const WorkflowRouteModel = require('../models/workflowRouteModel');

const TEST_USERS = {
  secretary: {
    idNumber: 'SEC-2026-PB45',
    name: 'Ms. Carmela Ortiz (Secretary)',
    email: 'secretary.pb45@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
  student: {
    idNumber: 'STU-2026-PB45',
    name: 'Maria Santos (Student)',
    email: 'student.pb45@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English',
    position: 'Student',
  },
  faculty: {
    idNumber: 'FAC-2026-PB45',
    name: 'Prof. Ana Lim (Faculty)',
    email: 'faculty.pb45@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Secondary Education',
    position: 'Assistant Professor',
  },
  chairperson: {
    idNumber: 'CHR-2026-PB45',
    name: 'Dr. Liza Fernandez (Chairperson)',
    email: 'chair.pb45@msunaawan.edu.ph',
    role: 'chairperson',
    origin: 'CESS',
    department: 'Secondary Education',
    position: 'Department Chairperson',
  },
  dean: {
    idNumber: 'DEN-2026-PB45',
    name: 'Dr. Roberto Gomez (Dean)',
    email: 'dean.pb45@msunaawan.edu.ph',
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
  console.log('🧪 RUNNING PB-45 INTEGRATION TESTS: CONFIGURE WORKFLOW ROUTES');
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

  const createdDocIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Inspect currently configured active workflow routes (GET /api/workflow/routes)
    // -------------------------------------------------------------------------
    console.log('\n1️⃣  Testing Inspection of Active Workflow Routes (GET /api/workflow/routes)...');

    WorkflowRouteModel.resetDefaults();

    const getRoutesRes = await request('/workflow/routes', { headers: secHeaders });
    assert.strictEqual(getRoutesRes.status, 200, 'Expected 200 OK for routes inspection');
    assert(getRoutesRes.body.routes, 'Expected routes in response');
    assert(getRoutesRes.body.routes.CESS, 'Expected CESS route');
    assert(getRoutesRes.body.routes.IDS, 'Expected IDS route');

    console.log(`   ✅ CESS Active Route (v${getRoutesRes.body.routes.CESS.version}): [${getRoutesRes.body.routes.CESS.sequence.join(' -> ')}]`);
    console.log(`   ✅ IDS Active Route (v${getRoutesRes.body.routes.IDS.version}): [${getRoutesRes.body.routes.IDS.sequence.join(' -> ')}]`);
    assert.strictEqual(getRoutesRes.body.routes.CESS.sequence[0], 'College Secretary');
    assert.strictEqual(getRoutesRes.body.routes.CESS.sequence[getRoutesRes.body.routes.CESS.sequence.length - 1], 'College Secretary');

    // -------------------------------------------------------------------------
    // TEST 2: Strict Route Sequence Validation (400 Bad Request)
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Route Sequence Validation Integrity (REQ-ROUTE-1)...');

    // A. Missing Secretary Start
    const missingStartRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      headers: secHeaders,
      body: {
        sequence: ['Department Chairperson', 'College Dean', 'College Secretary'],
      },
    });
    assert.strictEqual(missingStartRes.status, 400);
    assert(missingStartRes.body.error.includes("start with 'College Secretary'"));
    console.log(`   ✅ Blocked missing Secretary start -> 400: "${missingStartRes.body.error}"`);

    // B. Missing Secretary End
    const missingEndRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      headers: secHeaders,
      body: {
        sequence: ['College Secretary', 'Department Chairperson', 'College Dean'],
      },
    });
    assert.strictEqual(missingEndRes.status, 400);
    assert(missingEndRes.body.error.includes("terminate with 'College Secretary'"));
    console.log(`   ✅ Blocked missing Secretary release termination -> 400: "${missingEndRes.body.error}"`);

    // C. Adjacent Duplicate Offices
    const dupRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      headers: secHeaders,
      body: {
        sequence: ['College Secretary', 'Department Chairperson', 'Department Chairperson', 'College Dean', 'College Secretary'],
      },
    });
    assert.strictEqual(dupRes.status, 400);
    assert(dupRes.body.error.includes('duplicate step'));
    console.log(`   ✅ Blocked adjacent duplicate offices -> 400: "${dupRes.body.error}"`);

    // D. CESS containing IDS Principal
    const cessIdsRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      headers: secHeaders,
      body: {
        sequence: ['College Secretary', 'Department Chairperson', 'IDS Principal', 'College Dean', 'College Secretary'],
      },
    });
    assert.strictEqual(cessIdsRes.status, 400);
    assert(cessIdsRes.body.error.includes("CESS documents cannot route through the 'IDS Principal'"));
    console.log(`   ✅ Blocked CESS route containing IDS Principal -> 400: "${cessIdsRes.body.error}"`);

    // E. IDS missing IDS Principal
    const idsMissingPrinRes = await request('/workflow/routes/IDS', {
      method: 'PUT',
      headers: secHeaders,
      body: {
        sequence: ['College Secretary', 'Department Chairperson', 'College Dean', 'College Secretary'],
      },
    });
    assert.strictEqual(idsMissingPrinRes.status, 400);
    assert(idsMissingPrinRes.body.error.includes("IDS documents must include 'IDS Principal' review"));
    console.log(`   ✅ Blocked IDS route missing IDS Principal -> 400: "${idsMissingPrinRes.body.error}"`);

    // -------------------------------------------------------------------------
    // TEST 3: Student creates Doc 1 (In-Flight) under Version 1 route
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Submitting In-Flight Document (Doc 1) under Version 1 Route...');

    const submitDoc1Res = await request('/documents', {
      method: 'POST',
      headers: stuHeaders,
      body: {
        docTypeId: 1,
        title: 'In-Flight Document submitted under v1 Route',
        origin: 'CESS',
      },
    });
    assert.strictEqual(submitDoc1Res.status, 201);
    const doc1Id = submitDoc1Res.body.document.document_id || submitDoc1Res.body.document.id;
    createdDocIds.push(doc1Id);

    const doc1RouteRes = await request(`/documents/${doc1Id}/route`, { headers: stuHeaders });
    assert.strictEqual(doc1RouteRes.status, 200);
    console.log(`   ✅ Doc 1 created: ${submitDoc1Res.body.document.control_number}`);
    console.log(`   ✅ Doc 1 assigned route: [${doc1RouteRes.body.route.join(' -> ')}]`);
    assert.deepStrictEqual(doc1RouteRes.body.route, ['College Secretary', 'Department Chairperson', 'College Dean', 'College Secretary']);

    // Secretary routes Doc 1 to Department Chairperson
    const routeDoc1Res = await request(`/documents/${doc1Id}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: {
        decision: 'complete',
        remarks: 'Completeness verified. Routed to Chairperson for review.',
      },
    });
    assert.strictEqual(routeDoc1Res.status, 200);
    console.log(`   ✅ Doc 1 routed to Department Chairperson (Status: Under_Review)`);

    // -------------------------------------------------------------------------
    // TEST 4: Secretary updates CESS route sequence to Version 2
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Admin Updates CESS Route to Version 2 (PUT /api/workflow/routes/CESS)...');

    const updatedCessSequence = [
      'College Secretary',
      'Department Chairperson',
      'OVCAA',
      'College Dean',
      'College Secretary',
    ];

    const updateCessRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      headers: secHeaders,
      body: {
        sequence: updatedCessSequence,
        reason: 'Institutional memorandum 2026-10: OVCAA curriculum endorsement step added.',
      },
    });

    assert.strictEqual(updateCessRes.status, 200);
    assert.strictEqual(updateCessRes.body.route.version, 2);
    assert.deepStrictEqual(updateCessRes.body.route.sequence, updatedCessSequence);
    console.log(`   ✅ CESS Route successfully updated to Version 2:`);
    console.log(`      [${updateCessRes.body.route.sequence.join(' -> ')}]`);
    console.log(`   ✅ Reason recorded: "${updateCessRes.body.route.reason}"`);

    // -------------------------------------------------------------------------
    // TEST 5: Verify Audit Log Records Route Modification
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Route Change Audit Trail (GET /api/workflow/routes/history)...');

    const auditLogRes = await request('/workflow/routes/history', { headers: secHeaders });
    assert.strictEqual(auditLogRes.status, 200);
    assert(auditLogRes.body.history.length >= 1, 'Expected at least one audit entry');
    const latestAudit = auditLogRes.body.history[0];

    assert.strictEqual(latestAudit.origin, 'CESS');
    assert.strictEqual(latestAudit.version, 2);
    assert.strictEqual(latestAudit.changed_by_email, TEST_USERS.secretary.email);
    assert.deepStrictEqual(latestAudit.new_sequence, updatedCessSequence);
    console.log(`   ✅ Audit log verified: Actor=${latestAudit.changed_by_email}, v${latestAudit.version}, Timestamp=${latestAudit.timestamp}`);

    // -------------------------------------------------------------------------
    // TEST 6: Student creates Doc 2 (New Request) under Version 2 route
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Testing Migration Rule: "Changes Affect New Requests Only"...');

    const submitDoc2Res = await request('/documents', {
      method: 'POST',
      headers: stuHeaders,
      body: {
        docTypeId: 1,
        title: 'New Document submitted under v2 Route',
        origin: 'CESS',
      },
    });
    assert.strictEqual(submitDoc2Res.status, 201);
    const doc2Id = submitDoc2Res.body.document.document_id || submitDoc2Res.body.document.id;
    createdDocIds.push(doc2Id);

    // Verify Doc 2 follows Version 2 Route
    const doc2RouteRes = await request(`/documents/${doc2Id}/route`, { headers: stuHeaders });
    assert.strictEqual(doc2RouteRes.status, 200);
    console.log(`   ✅ New Doc 2 route (Version 2): [${doc2RouteRes.body.route.join(' -> ')}]`);
    assert.deepStrictEqual(doc2RouteRes.body.route, updatedCessSequence, 'Doc 2 must follow updated Version 2 sequence');

    // CRITICAL: Verify In-Flight Doc 1 still strictly follows Version 1 Route!
    const doc1RouteRecheck = await request(`/documents/${doc1Id}/route`, { headers: stuHeaders });
    assert.strictEqual(doc1RouteRecheck.status, 200);
    console.log(`   ✅ In-Flight Doc 1 route (re-checked): [${doc1RouteRecheck.body.route.join(' -> ')}]`);
    assert.deepStrictEqual(
      doc1RouteRecheck.body.route,
      ['College Secretary', 'Department Chairperson', 'College Dean', 'College Secretary'],
      'In-flight Doc 1 must preserve its original v1 route!'
    );

    // -------------------------------------------------------------------------
    // TEST 7: Transition Execution Honors Each Document's Assigned Route
    // -------------------------------------------------------------------------
    console.log('\n7️⃣  Testing Route Transition Follows Respective Document Snapshots...');

    // In Doc 1 (v1): Chairperson endorses -> Next step is College Dean
    const endorseDoc1Res = await request(`/documents/${doc1Id}/review`, {
      method: 'POST',
      headers: chrHeaders,
      body: {
        action: 'endorse',
        targetOfficeName: 'College Dean',
        remarks: 'Endorsed per original v1 routing sequence.',
      },
    });
    assert.strictEqual(endorseDoc1Res.status, 200);
    assert.strictEqual(endorseDoc1Res.body.document.office?.office_name, 'College Dean');
    console.log(`   ✅ In-Flight Doc 1: Chairperson endorsement routed to '${endorseDoc1Res.body.document.office?.office_name}' (v1 sequence preserved!)`);

    // In Doc 2 (v2): Secretary routes to Chairperson
    await request(`/documents/${doc2Id}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: { decision: 'complete', remarks: 'Routing Doc 2' },
    });

    // In Doc 2 (v2): Chairperson endorses -> Next step in v2 is OVCAA
    const endorseDoc2Res = await request(`/documents/${doc2Id}/review`, {
      method: 'POST',
      headers: chrHeaders,
      body: {
        action: 'endorse',
        targetOfficeName: 'OVCAA',
        remarks: 'Endorsed to OVCAA per v2 procedure.',
      },
    });
    assert.strictEqual(endorseDoc2Res.status, 200);
    console.log('DOC2 REVIEW RESPONSE:', JSON.stringify(endorseDoc2Res.body, null, 2));
    assert.strictEqual(endorseDoc2Res.body.document.office?.office_name, 'OVCAA');
    console.log(`   ✅ New Doc 2: Chairperson endorsement routed to '${endorseDoc2Res.body.document.office?.office_name}' (v2 sequence followed!)`);

    // -------------------------------------------------------------------------
    // TEST 8: RBAC Guard — Non-Admin Roles Blocked from Modifying Routes (REQ-REQT-8)
    // -------------------------------------------------------------------------
    console.log('\n8️⃣  Testing RBAC Guard: Non-Admin Roles Blocked (REQ-REQT-8)...');

    // Student attempt
    const stuPutRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      headers: stuHeaders,
      body: { sequence: updatedCessSequence },
    });
    assert.strictEqual(stuPutRes.status, 403);
    console.log(`   ✅ Student blocked from updating route -> 403 Forbidden: "${stuPutRes.body.error}"`);

    // Faculty attempt
    const facPutRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      headers: facHeaders,
      body: { sequence: updatedCessSequence },
    });
    assert.strictEqual(facPutRes.status, 403);
    console.log(`   ✅ Faculty blocked from updating route -> 403 Forbidden: "${facPutRes.body.error}"`);

    // Reviewer (Dean) attempt
    const denPutRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      headers: denHeaders,
      body: { sequence: updatedCessSequence },
    });
    assert.strictEqual(denPutRes.status, 403);
    console.log(`   ✅ College Dean blocked from updating route -> 403 Forbidden: "${denPutRes.body.error}"`);

    // Unauthenticated attempt
    const unauthPutRes = await request('/workflow/routes/CESS', {
      method: 'PUT',
      body: { sequence: updatedCessSequence },
    });
    assert.strictEqual(unauthPutRes.status, 401);
    console.log(`   ✅ Unauthenticated request blocked -> 401 Unauthorized: "${unauthPutRes.body.error}"`);

    console.log('\n================================================================');
    console.log('🎉 ALL 8 PB-45 INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    // Clean up created documents
    for (const docId of createdDocIds) {
      await DocumentModel.softDelete(docId);
    }
    // Restore default routes
    WorkflowRouteModel.resetDefaults();
    if (server) {
      server.close();
    }
  }
}

runTests().catch((err) => {
  console.error('❌ PB-45 Test failed:', err);
  process.exit(1);
});
