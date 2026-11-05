/**
 * Integration Test Suite for Ticket PB-20:
 * "Secretary verification queue/workstation [P0]"
 * Traceability: SRS 3.3 (Completeness/Content Check); SRS 3.4 (Recording & Repository); SRS 3.11 (Workflow Monitoring)
 * Dependencies: PB-15 (Completeness scan), PB-17 (Control Number)
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
    idNumber: 'IDS-FAC-01',
    name: 'Prof. Ronald Diaz',
    email: 'ids.faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'IDS Faculty',
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
  console.log('🧪 RUNNING PB-20 INTEGRATION TESTS: SECRETARY WORKSTATION QUEUE');
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
    const secretaryHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
    const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };
    const idsFacultyHeaders = { 'x-user-email': 'ids.faculty@msunaawan.edu.ph' };

    // -------------------------------------------------------------------------
    // 1️⃣ TC-PB20-1: RBAC Security Guard on Secretary Workstation
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing RBAC Security Guard on Secretary Queues (GET /api/documents/queues)...');
    const studentAccess = await request('/documents/queues', {
      method: 'GET',
      headers: studentHeaders,
    });
    if (studentAccess.status !== 403) {
      throw new Error(`Expected 403 Forbidden for Student, got ${studentAccess.status}`);
    }
    console.log(`   ✅ Student access blocked -> 403 Forbidden: "${studentAccess.body.error}"`);

    const chairAccess = await request('/documents/queues', {
      method: 'GET',
      headers: chairHeaders,
    });
    if (chairAccess.status !== 403) {
      throw new Error(`Expected 403 Forbidden for Chairperson, got ${chairAccess.status}`);
    }
    console.log(`   ✅ Reviewer access blocked -> 403 Forbidden: "${chairAccess.body.error}"`);

    const unauthAccess = await request('/documents/queues', { method: 'GET' });
    if (unauthAccess.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for unauthenticated request, got ${unauthAccess.status}`);
    }
    console.log(`   ✅ Unauthenticated request blocked -> 401 Unauthorized.`);

    // -------------------------------------------------------------------------
    // 2️⃣ TC-PB20-2: Secretary retrieves Workstation Queues with exact counts
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Secretary Workstation Queue Retrieval & Count Integrity...');
    const queueRes = await request('/documents/queues', {
      method: 'GET',
      headers: secretaryHeaders,
    });

    if (queueRes.status !== 200) {
      throw new Error(`Failed to fetch queues: ${JSON.stringify(queueRes.body)}`);
    }

    const { queues, counts } = queueRes.body;
    const requiredQueues = [
      'awaiting_verification',
      'in_review',
      'ready_for_release',
      'returned',
      'rejected',
      'ids_handoff',
    ];

    for (const q of requiredQueues) {
      if (!Array.isArray(queues[q])) {
        throw new Error(`Missing expected queue state array: '${q}'`);
      }
      if (typeof counts[q] !== 'number') {
        throw new Error(`Missing count metric for queue: '${q}'`);
      }
      if (counts[q] !== queues[q].length) {
        throw new Error(`Count mismatch for '${q}': count says ${counts[q]}, but array length is ${queues[q].length}`);
      }
    }

    console.log('   ✅ All 6 agreed queue states verified with 100% matching counts:');
    console.log(`      - Awaiting Verification: ${counts.awaiting_verification} doc(s)`);
    console.log(`      - In Review:            ${counts.in_review} doc(s)`);
    console.log(`      - Ready for Release:    ${counts.ready_for_release} doc(s)`);
    console.log(`      - Returned:             ${counts.returned} doc(s)`);
    console.log(`      - Rejected:             ${counts.rejected} doc(s)`);
    console.log(`      - IDS Handoff:          ${counts.ids_handoff} doc(s)`);
    console.log(`      - Total Active Records: ${counts.total} doc(s)`);

    // -------------------------------------------------------------------------
    // 3️⃣ TC-PB20-3: New Request Enters "Awaiting Verification"
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Document Ingestion into "Awaiting Verification" queue...');
    const initialCounts = counts;
    const submitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        doc_type_id: 1,
        title: 'PB-20 Test Request (Awaiting Verification)',
        description: 'New submission test',
      }),
    });

    if (submitRes.status !== 201) {
      throw new Error(`Failed to submit document: ${JSON.stringify(submitRes.body)}`);
    }
    const testDoc = submitRes.body.document;
    const docId = testDoc.document_id || testDoc.id;

    const afterSubmit = await request('/documents/queues', {
      method: 'GET',
      headers: secretaryHeaders,
    });
    const newAwaiting = afterSubmit.body.queues.awaiting_verification;
    const foundDoc = newAwaiting.find((d) => (d.document_id || d.id) === docId);
    if (!foundDoc) {
      throw new Error(`Submitted doc ${testDoc.control_number} not found in awaiting_verification queue!`);
    }
    if (afterSubmit.body.counts.awaiting_verification !== initialCounts.awaiting_verification + 1) {
      throw new Error(`Expected awaiting_verification count to increment by 1`);
    }
    console.log(`   ✅ Document ${testDoc.control_number} successfully placed in "Awaiting Verification".`);
    console.log(`   ✅ Count incremented accurately: ${afterSubmit.body.counts.awaiting_verification}`);

    // -------------------------------------------------------------------------
    // 4️⃣ TC-PB20-4: Secretary Verification Moves Document to "In Review"
    // -------------------------------------------------------------------------
    console.log('\n4️⃣  Testing State Transition from "Awaiting Verification" to "In Review"...');
    await request(`/documents/${docId}/check`, {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({
        decision: 'complete',
        nextOfficeName: 'Department Chairperson',
        remarks: 'Completeness check verified, routing for Chairperson review.',
      }),
    });

    const afterRoute = await request('/documents/queues', {
      method: 'GET',
      headers: secretaryHeaders,
    });
    const inReviewList = afterRoute.body.queues.in_review;
    const docInReview = inReviewList.find((d) => (d.document_id || d.id) === docId);
    if (!docInReview) {
      throw new Error(`Document ${testDoc.control_number} did not move into in_review queue!`);
    }
    console.log(`   ✅ Document moved to "In Review" queue (Held by: Chairperson).`);
    console.log(`   ✅ Updated In Review count: ${afterRoute.body.counts.in_review}`);

    // -------------------------------------------------------------------------
    // 5️⃣ TC-PB20-5: Reviewer Return Moves Document to "Returned"
    // -------------------------------------------------------------------------
    console.log('\n5️⃣  Testing State Transition from "In Review" to "Returned"...');
    await request(`/documents/${docId}/review`, {
      method: 'POST',
      headers: chairHeaders,
      body: JSON.stringify({
        action: 'returned',
        remarks: 'PB-20 Verification test: returned for minor correction.',
      }),
    });

    const afterReturn = await request('/documents/queues', {
      method: 'GET',
      headers: secretaryHeaders,
    });
    const returnedList = afterReturn.body.queues.returned;
    const docReturned = returnedList.find((d) => (d.document_id || d.id) === docId);
    if (!docReturned) {
      throw new Error(`Document ${testDoc.control_number} did not move into returned queue!`);
    }
    console.log(`   ✅ Document moved to "Returned" queue.`);
    console.log(`   ✅ Updated Returned count: ${afterReturn.body.counts.returned}`);

    // -------------------------------------------------------------------------
    // 6️⃣ TC-PB20-6: IDS Document Tracking in "IDS Handoff"
    // -------------------------------------------------------------------------
    console.log('\n6️⃣  Testing Dedicated IDS Handoff Queue (origin = "IDS")...');
    const idsSubmit = await request('/documents', {
      method: 'POST',
      headers: idsFacultyHeaders,
      body: JSON.stringify({
        doc_type_id: 6, // IDS Travel Order
        title: 'PB-20 IDS Travel Order Request',
        origin: 'IDS',
      }),
    });

    if (idsSubmit.status !== 201) {
      throw new Error(`Failed to submit IDS request: ${JSON.stringify(idsSubmit.body)}`);
    }
    const idsDoc = idsSubmit.body.document;
    const idsDocId = idsDoc.document_id || idsDoc.id;

    const idsQueueCheck = await request('/documents/queues', {
      method: 'GET',
      headers: secretaryHeaders,
    });
    const idsList = idsQueueCheck.body.queues.ids_handoff;
    const docInIds = idsList.find((d) => (d.document_id || d.id) === idsDocId);
    if (!docInIds) {
      throw new Error(`IDS document ${idsDoc.control_number} not found in ids_handoff queue!`);
    }
    console.log(`   ✅ IDS document ${idsDoc.control_number} successfully tracked in "IDS Handoff".`);
    console.log(`   ✅ IDS Handoff count: ${idsQueueCheck.body.counts.ids_handoff}`);

    // -------------------------------------------------------------------------
    // 7️⃣ TC-PB20-7: Direct Queue Query Filter Support (?queue=...)
    // -------------------------------------------------------------------------
    console.log('\n7️⃣  Testing Direct Query Parameter Queue Filtering (GET /api/documents?queue=...)...');
    const inReviewFilter = await request('/documents?queue=in_review', {
      method: 'GET',
      headers: secretaryHeaders,
    });
    if (inReviewFilter.status !== 200) {
      throw new Error(`Failed to filter by queue=in_review: ${JSON.stringify(inReviewFilter.body)}`);
    }
    const allInReview = inReviewFilter.body.documents.every((d) => d.current_status === 'Under_Review');
    if (!allInReview) {
      throw new Error('Filtered documents contain non-Under_Review status records!');
    }
    console.log(`   ✅ GET /api/documents?queue=in_review strictly returns Under_Review records (${inReviewFilter.body.count} docs).`);

    const returnedFilter = await request('/documents?queue=returned', {
      method: 'GET',
      headers: secretaryHeaders,
    });
    const allReturned = returnedFilter.body.documents.every((d) => d.current_status === 'Returned');
    if (!allReturned) {
      throw new Error('Filtered documents contain non-Returned status records!');
    }
    console.log(`   ✅ GET /api/documents?queue=returned strictly returns Returned records (${returnedFilter.body.count} docs).`);

    const idsFilter = await request('/documents?queue=ids_handoff', {
      method: 'GET',
      headers: secretaryHeaders,
    });
    const allIds = idsFilter.body.documents.every((d) => d.origin === 'IDS');
    if (!allIds) {
      throw new Error('Filtered documents contain non-IDS records!');
    }
    console.log(`   ✅ GET /api/documents?queue=ids_handoff strictly returns IDS records (${idsFilter.body.count} docs).`);

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('🎉 ALL PB-20 INTEGRATION TESTS PASSED (7 of 7)!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ PB-20 Test Suite Failed:', err.message);
  process.exit(1);
});
