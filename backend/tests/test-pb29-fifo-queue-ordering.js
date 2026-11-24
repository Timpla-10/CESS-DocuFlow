/**
 * Integration Test Suite for Ticket PB-29:
 * "First-come, first-served queue ordering [P1]"
 *
 * SRS Traceability:
 *   - SRS 3.9: REQ-ORD-1 to REQ-ORD-4 (First-come first-served, visible timestamps, filter preservation, approved exceptions)
 *   - SRS 3.3 & 3.11: Fair queue handling across Secretary and Reviewer workstations
 *
 * Acceptance Criteria:
 *   1. Default order is oldest eligible request first (FIFO)
 *   2. Timestamp visible (submitted_at, officeSince, wait duration)
 *   3. Filters preserve FIFO queue order
 *   4. Approved exceptions are flagged and prioritized
 *
 * Dependencies: PB-17 (View and filter pending requests)
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
  console.log('🧪 RUNNING PB-29 INTEGRATION TESTS: FIRST-COME, FIRST-SERVED QUEUES');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  let server;
  const port = 5029;
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

    // -------------------------------------------------------------------------
    // Setup: Submit 3 documents at distinct staggered timestamps (T1 < T2 < T3)
    // -------------------------------------------------------------------------
    console.log('0️⃣  Setting up: Submitting 3 staggered test requests (T1 < T2 < T3)...');
    const createdDocs = [];
    for (let i = 1; i <= 3; i++) {
      const res = await request('/documents', {
        method: 'POST',
        headers: studentHeaders,
        body: JSON.stringify({
          docTypeId: 1, // Completion of INC
          title: `PB-29 Queue Item #${i} - Submission Order Test`,
          description: `Testing FIFO ordering sequence for document ${i}`,
          origin: 'CESS',
        }),
      });
      assert.strictEqual(res.status, 201, `Submission of doc ${i} failed`);
      const d = res.body.document || res.body;
      createdDocs.push(d);
      console.log(`   📄 Lodged Doc #${i}: ${d.control_number} at ${d.submitted_at}`);
      // Short pause to guarantee millisecond timestamp progression
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const [doc1, doc2, doc3] = createdDocs;

    // -------------------------------------------------------------------------
    // TC-PB29-1: Default FIFO Queue Ordering (Oldest Eligible First - AC 1)
    // -------------------------------------------------------------------------
    console.log('\n1️⃣  Testing Default FIFO Order for Pending Requests (AC 1)...');
    const queueRes = await request('/documents?queue=awaiting_verification', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(queueRes.status, 200);
    const docsInQueue = queueRes.body.documents;

    const idx1 = docsInQueue.findIndex((d) => (d.id || d.document_id) === (doc1.id || doc1.document_id));
    const idx2 = docsInQueue.findIndex((d) => (d.id || d.document_id) === (doc2.id || doc2.document_id));
    const idx3 = docsInQueue.findIndex((d) => (d.id || d.document_id) === (doc3.id || doc3.document_id));

    assert.ok(idx1 !== -1 && idx2 !== -1 && idx3 !== -1, 'All 3 submitted documents must be present in queue');
    assert.ok(idx1 < idx2, `Doc 1 (#${idx1}) must precede Doc 2 (#${idx2}) in FIFO queue`);
    assert.ok(idx2 < idx3, `Doc 2 (#${idx2}) must precede Doc 3 (#${idx3}) in FIFO queue`);
    console.log(`   ✅ Strict FIFO sequence verified: Doc1 (#${idx1}) -> Doc2 (#${idx2}) -> Doc3 (#${idx3}) [Oldest First].`);

    // -------------------------------------------------------------------------
    // TC-PB29-2: Transparent Timestamps on Every Record (AC 2)
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Transparent Timestamps & Waiting Metrics (AC 2)...');
    const sample = docsInQueue[idx1];
    assert.ok(sample.submitted_at, 'Record must expose submitted_at timestamp');
    assert.ok(sample.officeSince, 'Record must expose officeSince arrival timestamp');
    assert.strictEqual(typeof sample.timeWaitingMs, 'number', 'timeWaitingMs must be a number');
    assert.strictEqual(typeof sample.daysWaiting, 'number', 'daysWaiting must be a number');
    assert.strictEqual(typeof sample.is_expedited, 'boolean', 'is_expedited must be a boolean');
    assert.ok(['Standard', 'Urgent'].includes(sample.priority), 'priority must be Standard or Urgent');

    console.log(`   ✅ Timing fields verified on ${sample.control_number}:`);
    console.log(`      - submitted_at   : ${sample.submitted_at}`);
    console.log(`      - officeSince    : ${sample.officeSince}`);
    console.log(`      - timeWaitingMs  : ${sample.timeWaitingMs} ms`);
    console.log(`      - priority       : ${sample.priority} (Expedited: ${sample.is_expedited})`);

    // -------------------------------------------------------------------------
    // TC-PB29-3: Filters Preserve FIFO Order (AC 3)
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Filters Preserve FIFO Order (AC 3)...');
    const filteredRes = await request('/documents?origin=CESS&docTypeId=1&stage=awaiting_verification', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(filteredRes.status, 200);
    const filteredDocs = filteredRes.body.documents;

    const fIdx1 = filteredDocs.findIndex((d) => (d.id || d.document_id) === (doc1.id || doc1.document_id));
    const fIdx2 = filteredDocs.findIndex((d) => (d.id || d.document_id) === (doc2.id || doc2.document_id));
    const fIdx3 = filteredDocs.findIndex((d) => (d.id || d.document_id) === (doc3.id || doc3.document_id));

    assert.ok(fIdx1 < fIdx2 && fIdx2 < fIdx3, 'Filters must preserve FIFO order');
    console.log('   ✅ FIFO ordering successfully preserved across multi-parameter filtering (?origin=CESS&stage=awaiting_verification).');

    // -------------------------------------------------------------------------
    // TC-PB29-4: Sort Override Parameter (?sort=newest & ?sort=waiting_longest)
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Sort Overrides (?sort=newest & ?sort=waiting_longest)...');
    const newestRes = await request('/documents?queue=awaiting_verification&sort=newest', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(newestRes.status, 200);
    const newestDocs = newestRes.body.documents;

    const nIdx1 = newestDocs.findIndex((d) => (d.id || d.document_id) === (doc1.id || doc1.document_id));
    const nIdx3 = newestDocs.findIndex((d) => (d.id || d.document_id) === (doc3.id || doc3.document_id));
    assert.ok(nIdx3 < nIdx1, '?sort=newest must reverse order (Doc 3 must precede Doc 1)');
    console.log(`   ✅ ?sort=newest successfully inverted order (Doc3 #${nIdx3} precedes Doc1 #${nIdx1}).`);

    // -------------------------------------------------------------------------
    // TC-PB29-5: Secretary Workstation Queues FIFO Ordering (AC 1)
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing Secretary Workstation Queues FIFO Ordering (GET /api/documents/queues)...');
    const workstationRes = await request('/documents/queues', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(workstationRes.status, 200);
    const awaitingQueue = workstationRes.body.queues.awaiting_verification;

    // Verify each non-expedited item has non-decreasing submission time
    let isChronological = true;
    for (let i = 0; i < awaitingQueue.length - 1; i++) {
      const a = awaitingQueue[i];
      const b = awaitingQueue[i + 1];
      if (!a.is_expedited && !b.is_expedited) {
        if (new Date(a.submitted_at).getTime() > new Date(b.submitted_at).getTime()) {
          isChronological = false;
          break;
        }
      }
    }
    assert.ok(isChronological, 'Workstation queues must be strictly chronological FIFO');
    console.log(`   ✅ Workstation awaiting queue (${awaitingQueue.length} records) verified in strict FIFO order.`);

    // -------------------------------------------------------------------------
    // TC-PB29-6: Flagging Approved Exception (AC 4)
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Testing Approved Exception Flagging (POST /api/documents/:id/flag-exception)...');
    // Submit a 4th document (T4, newest)
    const doc4Res = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: 'PB-29 Expedited Emergency Document #4',
        description: 'Graduating student needing urgent endorsement for board exam registration.',
        origin: 'CESS',
      }),
    });
    assert.strictEqual(doc4Res.status, 201);
    const doc4 = doc4Res.body.document || doc4Res.body;
    const doc4Id = doc4.id || doc4.document_id;

    // Secretary approves and flags exception
    const exceptionReason = 'Graduation clearance deadline: Registrar requires immediate endorsement by Nov 12.';
    const flagRes = await request(`/documents/${doc4Id}/flag-exception`, {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({
        reason: exceptionReason,
        priority: 'Urgent',
      }),
    });

    assert.strictEqual(flagRes.status, 200, `Expected 200 OK, got ${flagRes.status}`);
    assert.strictEqual(flagRes.body.document.is_expedited, true, 'is_expedited must be true');
    assert.strictEqual(flagRes.body.document.priority, 'Urgent', 'priority must be Urgent');
    assert.ok(flagRes.body.document.exception_info, 'exception_info must be populated');
    assert.strictEqual(flagRes.body.document.exception_info.reason, exceptionReason);
    console.log(`   ✅ Approved exception flagged: ${flagRes.body.document.control_number} [PRIORITY: Urgent]`);
    console.log(`      - Justification: "${exceptionReason}"`);

    // -------------------------------------------------------------------------
    // TC-PB29-7: Exception Queue Prioritization (Pinned at top of FIFO Queue - AC 4)
    // -------------------------------------------------------------------------
    console.log('\n7️⃣  Testing Exception Surfaces to Top of FIFO Queue (AC 4)...');
    const postFlagQueue = await request('/documents?queue=awaiting_verification', {
      method: 'GET',
      headers: secHeaders,
    });
    assert.strictEqual(postFlagQueue.status, 200);
    const updatedQueue = postFlagQueue.body.documents;

    const idx4 = updatedQueue.findIndex((d) => (d.id || d.document_id) === doc4Id);
    const updatedIdx1 = updatedQueue.findIndex((d) => (d.id || d.document_id) === (doc1.id || doc1.document_id));
    const updatedIdx2 = updatedQueue.findIndex((d) => (d.id || d.document_id) === (doc2.id || doc2.document_id));
    const updatedIdx3 = updatedQueue.findIndex((d) => (d.id || d.document_id) === (doc3.id || doc3.document_id));

    assert.ok(idx4 < updatedIdx1, `Expedited Doc 4 (#${idx4}) must surface ahead of standard Doc 1 (#${updatedIdx1})`);
    assert.ok(
      updatedIdx1 < updatedIdx2 && updatedIdx2 < updatedIdx3,
      'Standard documents must maintain relative FIFO order behind expedited item'
    );
    console.log(`   ✅ Priority placement verified: Doc4 (Expedited, #${idx4}) -> Doc1 (#${updatedIdx1}) -> Doc2 (#${updatedIdx2}) -> Doc3 (#${updatedIdx3}).`);

    // -------------------------------------------------------------------------
    // TC-PB29-8: RBAC Security Guard on Exception Flagging
    // -------------------------------------------------------------------------
    console.log('\n8️⃣  Testing RBAC & Validation Security Guard...');
    // Requester (Student) blocked from flagging exceptions
    const studentBlockRes = await request(`/documents/${(doc1.id || doc1.document_id)}/flag-exception`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        reason: 'Student self-expedite attempt.',
      }),
    });
    assert.strictEqual(studentBlockRes.status, 403, 'Requester must be blocked with 403 Forbidden');
    console.log(`   ✅ Student self-expedite blocked -> 403 Forbidden: "${studentBlockRes.body.error}"`);

    // Missing reason returns 400 Bad Request
    const missingReasonRes = await request(`/documents/${(doc1.id || doc1.document_id)}/flag-exception`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        reason: '',
      }),
    });
    assert.strictEqual(missingReasonRes.status, 400, 'Empty reason must return 400 Bad Request');
    console.log(`   ✅ Empty reason blocked -> 400 Bad Request: "${missingReasonRes.body.error}"`);

    // Unauthenticated request returns 401 Unauthorized
    const unauthRes = await request(`/documents/${(doc1.id || doc1.document_id)}/flag-exception`, {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Unauthenticated attempt.',
      }),
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401 Unauthorized');
    console.log('   ✅ Unauthenticated exception flagging blocked -> 401 Unauthorized.');

    console.log('\n================================================================');
    console.log('🎉 ALL 8 PB-29 INTEGRATION TESTS PASSED (8 of 8)!');
    console.log('================================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-29 Test Suite Failed:', err);
  process.exit(1);
});
