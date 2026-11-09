/**
 * Integration Test Suite for Ticket PB-28:
 * "Secretary workflow map and office counts [P1]"
 *
 * SRS Traceability:
 *   - SRS 3.11: Workflow Monitoring, Bottleneck Detection, and Queue Oversight
 *   - SRS 3.5: Multi-Office Routing & Review Stages
 *   - SRS 3.6: Dynamic Tracking & Status Transitions
 *
 * Acceptance Criteria:
 *   1. Shows counts by office/stage
 *   2. Selecting count filters records
 *   3. Counts update when workflow changes and avoid double-counting
 *
 * Dependencies: PB-26 (Timeline & Current Office Tracking)
 */
const assert = require('assert');
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
  console.log('🧪 RUNNING PB-28 INTEGRATION TESTS: WORKFLOW MAP & OFFICE COUNTS');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  let server;
  const port = 5028;
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
    // TC-PB28-1: Workflow Map Endpoint Retrieval & Schema (AC 1)
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Workflow Map Retrieval & Structure (AC 1)...');
    const mapRes = await request('/documents/workflow-map', {
      method: 'GET',
      headers: secHeaders,
    });

    assert.strictEqual(mapRes.status, 200, `Expected 200 OK, got ${mapRes.status}`);
    const mapData = mapRes.body;
    assert.ok(mapData.summary, 'Response must include summary metrics');
    assert.ok(Array.isArray(mapData.stages), 'Response must include stages array');
    assert.ok(Array.isArray(mapData.officeCounts), 'Response must include officeCounts array');
    assert.ok(mapData.routes, 'Response must include active routes configuration');
    assert.strictEqual(mapData.officeCounts.length, 10, 'Must include all 10 institutional offices');

    console.log(`   ✅ Workflow map retrieved successfully:`);
    console.log(`      - Total Active Records: ${mapData.summary.totalActive}`);
    console.log(`      - In Review Across Offices: ${mapData.summary.totalInReview}`);
    console.log(`      - Returned for Revision: ${mapData.summary.totalReturned}`);
    console.log(`      - Total System Records: ${mapData.summary.totalRecords}\n`);

    // -------------------------------------------------------------------------
    // TC-PB28-2: Zero Double-Counting Verification (AC 3)
    // -------------------------------------------------------------------------
    console.log('2️⃣  Testing Zero Double-Counting & Partition Invariant (AC 3)...');
    const stageSum = mapData.stages.reduce((acc, s) => acc + s.count, 0);
    assert.strictEqual(
      stageSum,
      mapData.summary.totalRecords,
      `Stage partition sum (${stageSum}) must equal totalRecords (${mapData.summary.totalRecords})`
    );

    const officeTotal = mapData.officeCounts.reduce((acc, o) => acc + o.count, 0);
    const calculatedTotal =
      officeTotal +
      mapData.summary.totalReturned +
      mapData.summary.totalRejected +
      mapData.summary.totalReleased;

    assert.strictEqual(
      calculatedTotal,
      mapData.summary.totalRecords,
      `Office partition sum + non-office records (${calculatedTotal}) must equal totalRecords (${mapData.summary.totalRecords})`
    );

    assert.strictEqual(
      officeTotal,
      mapData.summary.totalActive,
      `Total active documents in offices (${officeTotal}) must equal totalActive (${mapData.summary.totalActive})`
    );
    console.log('   ✅ Mathematical partition verified: 0 phantom counts, 0 duplicates, 0 orphaned records.\n');

    // -------------------------------------------------------------------------
    // TC-PB28-3: Live Count Updates on Initial Routing (AC 3)
    // -------------------------------------------------------------------------
    console.log('3️⃣  Testing Dynamic Count Shifts on Verification & Routing (AC 3)...');
    // Read initial baseline counts
    const initBaseline = await request('/documents/workflow-map', {
      method: 'GET',
      headers: secHeaders,
    });
    const initSecCount = initBaseline.body.officeCounts.find((o) => o.officeName === 'College Secretary').count;
    const initChairCount = initBaseline.body.officeCounts.find((o) => o.officeName === 'Department Chairperson').count;

    // Student submits a new request
    const submitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1, // Completion of INC
        title: 'PB-28 Workflow Map Test Document',
        description: 'Tracking live dynamic office transitions across the pipeline.',
        origin: 'CESS',
      }),
    });
    assert.strictEqual(submitRes.status, 201);
    const testDoc = submitRes.body.document || submitRes.body;
    const testDocId = testDoc.id || testDoc.document_id;
    const controlNo = testDoc.control_number;

    // After submission: College Secretary awaiting count must increment by 1
    const postSubmitMap = await request('/documents/workflow-map', {
      method: 'GET',
      headers: secHeaders,
    });
    const postSubSecCount = postSubmitMap.body.officeCounts.find((o) => o.officeName === 'College Secretary').count;
    assert.strictEqual(
      postSubSecCount,
      initSecCount + 1,
      `College Secretary count must increment by 1 after submission (was ${initSecCount}, now ${postSubSecCount})`
    );

    // Secretary verifies completeness and routes to Department Chairperson
    const routeRes = await request(`/documents/${testDocId}/check`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({
        remarks: 'PB-28 verified completeness. Routed to Department Chairperson.',
      }),
    });
    assert.strictEqual(routeRes.status, 200, 'Secretary check and route must succeed');

    // After routing: Secretary count decrements by 1; Chairperson count increments by 1
    const postRouteMap = await request('/documents/workflow-map', {
      method: 'GET',
      headers: secHeaders,
    });
    const postRouteSecCount = postRouteMap.body.officeCounts.find((o) => o.officeName === 'College Secretary').count;
    const postRouteChairCount = postRouteMap.body.officeCounts.find((o) => o.officeName === 'Department Chairperson').count;

    assert.strictEqual(
      postRouteSecCount,
      initSecCount,
      `Secretary count must decrement back to initial after routing (expected ${initSecCount}, got ${postRouteSecCount})`
    );
    assert.strictEqual(
      postRouteChairCount,
      initChairCount + 1,
      `Chairperson count must increment by 1 after routing (expected ${initChairCount + 1}, got ${postRouteChairCount})`
    );
    console.log(`   ✅ Dynamic Shift: Secretary (${postRouteSecCount}) -> Chairperson (${postRouteChairCount}) [Exact +1 shift].\n`);

    // -------------------------------------------------------------------------
    // TC-PB28-4: Live Count Updates on Endorsement Handoff (AC 3)
    // -------------------------------------------------------------------------
    console.log('4️⃣  Testing Dynamic Count Shifts on Office Endorsement (AC 3)...');
    const initDeanCount = postRouteMap.body.officeCounts.find((o) => o.officeName === 'College Dean').count;

    // Chairperson endorses document to College Dean
    const endorseRes = await request(`/documents/${testDocId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'Endorse',
        decision: 'Endorse',
        remarks: 'PB-28 endorsed by Chairperson for Dean approval.',
      }),
    });
    assert.strictEqual(endorseRes.status, 200, 'Chairperson endorsement must succeed');

    // After endorsement: Chairperson count decrements by 1; Dean count increments by 1
    const postEndorseMap = await request('/documents/workflow-map', {
      method: 'GET',
      headers: secHeaders,
    });
    const postEndorseChairCount = postEndorseMap.body.officeCounts.find((o) => o.officeName === 'Department Chairperson').count;
    const postEndorseDeanCount = postEndorseMap.body.officeCounts.find((o) => o.officeName === 'College Dean').count;

    assert.strictEqual(
      postEndorseChairCount,
      initChairCount,
      `Chairperson count must decrement by 1 (expected ${initChairCount}, got ${postEndorseChairCount})`
    );
    assert.strictEqual(
      postEndorseDeanCount,
      initDeanCount + 1,
      `Dean count must increment by 1 (expected ${initDeanCount + 1}, got ${postEndorseDeanCount})`
    );
    console.log(`   ✅ Dynamic Shift: Chairperson (${postEndorseChairCount}) -> Dean (${postEndorseDeanCount}) [Exact handoff].\n`);

    // -------------------------------------------------------------------------
    // TC-PB28-5: Live Count Updates on Return for Revision (AC 3)
    // -------------------------------------------------------------------------
    console.log('5️⃣  Testing Dynamic Count Shifts on Return for Revision (AC 3)...');
    const preReturnReturnedStage = postEndorseMap.body.stages.find((s) => s.key === 'returned').count;

    // Dean returns document to requester for revision
    const returnRes = await request(`/documents/${testDocId}/return`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({
        reason: 'PB-28 Test Return: Missing official signature in section C.',
      }),
    });
    assert.strictEqual(returnRes.status, 200, 'Dean return must succeed');

    // After return: Dean count decrements by 1; Returned stage increments by 1
    const postReturnMap = await request('/documents/workflow-map', {
      method: 'GET',
      headers: secHeaders,
    });
    const postReturnDeanCount = postReturnMap.body.officeCounts.find((o) => o.officeName === 'College Dean').count;
    const postReturnReturnedStage = postReturnMap.body.stages.find((s) => s.key === 'returned').count;

    assert.strictEqual(
      postReturnDeanCount,
      initDeanCount,
      `Dean count must decrement by 1 after return (expected ${initDeanCount}, got ${postReturnDeanCount})`
    );
    assert.strictEqual(
      postReturnReturnedStage,
      preReturnReturnedStage + 1,
      `Returned stage must increment by 1 (expected ${preReturnReturnedStage + 1}, got ${postReturnReturnedStage})`
    );
    console.log(`   ✅ Dynamic Shift: Dean (${postReturnDeanCount}) -> Returned for Revision (${postReturnReturnedStage}).\n`);

    // -------------------------------------------------------------------------
    // TC-PB28-6: Selecting Office Filters Records (AC 2)
    // -------------------------------------------------------------------------
    console.log('6️⃣  Testing Record Filtering by Holding Office (AC 2)...');
    // Filter by office name
    const filterChairRes = await request('/documents?office=chairperson', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(filterChairRes.status, 200);
    assert.ok(Array.isArray(filterChairRes.body.documents));
    for (const d of filterChairRes.body.documents) {
      assert.strictEqual(d.office?.office_name, 'Department Chairperson');
    }
    console.log(`   ✅ GET /api/documents?office=chairperson strictly returned ${filterChairRes.body.documents.length} Chairperson documents.`);

    // Filter by office ID
    const filterDeanRes = await request('/documents?officeId=4', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(filterDeanRes.status, 200);
    assert.ok(Array.isArray(filterDeanRes.body.documents));
    for (const d of filterDeanRes.body.documents) {
      assert.strictEqual(d.office?.office_name, 'College Dean');
    }
    console.log(`   ✅ GET /api/documents?officeId=4 strictly returned ${filterDeanRes.body.documents.length} Dean documents.\n`);

    // -------------------------------------------------------------------------
    // TC-PB28-7: Selecting Stage Filters Records (AC 2)
    // -------------------------------------------------------------------------
    console.log('7️⃣  Testing Record Filtering by Lifecycle Stage (AC 2)...');
    const filterInReviewRes = await request('/documents?stage=in_review', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(filterInReviewRes.status, 200);
    for (const d of filterInReviewRes.body.documents) {
      assert.ok(
        d.current_status === 'Under_Review' || d.current_status === 'With_External_Office',
        `Document ${d.control_number} must be in review stage`
      );
    }
    console.log(`   ✅ GET /api/documents?stage=in_review strictly returned ${filterInReviewRes.body.documents.length} In-Review documents.`);

    const filterReturnedRes = await request('/documents?stage=returned', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(filterReturnedRes.status, 200);
    for (const d of filterReturnedRes.body.documents) {
      assert.strictEqual(d.current_status, 'Returned');
    }
    console.log(`   ✅ GET /api/documents?stage=returned strictly returned ${filterReturnedRes.body.documents.length} Returned documents.\n`);

    // -------------------------------------------------------------------------
    // TC-PB28-8: RBAC Security Guard on Workflow Map
    // -------------------------------------------------------------------------
    console.log('8️⃣  Testing RBAC Security Guard on Workflow Map...');
    // Reviewers (Chairperson, Dean) are authorized to view workflow map
    const chairMapRes = await request('/documents/workflow-map', {
      method: 'GET',
      headers: chairHeaders,
    });
    assert.strictEqual(chairMapRes.status, 200, 'Chairperson must be authorized to view workflow map');

    const deanMapRes = await request('/documents/workflow-map', {
      method: 'GET',
      headers: deanHeaders,
    });
    assert.strictEqual(deanMapRes.status, 200, 'Dean must be authorized to view workflow map');

    // Students are blocked from institutional overview
    const studentMapRes = await request('/documents/workflow-map', {
      method: 'GET',
      headers: studentHeaders,
    });
    assert.strictEqual(
      studentMapRes.status,
      403,
      'Student must be blocked from institutional workflow map'
    );
    assert.ok(
      studentMapRes.body.error.includes('Forbidden'),
      'Expected 403 Forbidden error message'
    );
    console.log(`   ✅ Student access blocked -> 403 Forbidden: "${studentMapRes.body.error}"`);

    // Unauthenticated request is blocked
    const unauthRes = await request('/documents/workflow-map', {
      method: 'GET',
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    console.log('   ✅ Unauthenticated request blocked -> 401 Unauthorized.');

    console.log('\n================================================================');
    console.log('🎉 ALL 8 PB-28 INTEGRATION TESTS PASSED (8 of 8)!');
    console.log('================================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-28 Test Suite Failed:', err);
  process.exit(1);
});
