process.env.NODE_ENV = 'test';

/**
 * Integration Test Suite for Ticket PB-31:
 * "Record external-office transfers [P1]"
 *
 * User Story:
 *   As the College Secretary, I want to record when a document is sent to and
 *   returned from an external office (HRMO, Registrar, Budget & Accounting, etc.)
 *   so that the document's permanent history and tracking view stay accurate
 *   without needing external office accounts.
 *
 * SRS Reference: Section 3.8 — REQ-EXT-1 to REQ-EXT-7
 *
 * Acceptance Criteria tested:
 *   REQ-EXT-1: Secretary records transfer to named external office
 *   REQ-EXT-2: Fields captured: office name, transfer date, handed-by, reference no., remarks
 *   REQ-EXT-3: Secretary records return with return date, outcome, and return notes
 *   REQ-EXT-4: Status changes to 'With_External_Office' on send, 'Under_Review' on return
 *   REQ-EXT-5: Only College Secretary can record sends or returns (all other roles → 403)
 *   REQ-EXT-6: Secretary can retrieve the pending external transfers queue
 *   REQ-EXT-7: No external office accounts or integrations required (structural — verified by design)
 */

const app = require('../server');
const DocumentModel = require('../models/documentModel');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser } = require('../services/authService');

// ---------------------------------------------------------------------------
// Test users
// ---------------------------------------------------------------------------
const TEST_USERS = [
  {
    idNumber: 'STU-PB31-01',
    name: 'Ana Dela Cruz',
    email: 'student.pb31@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BA Communication, 3rd Year',
    position: 'Student',
  },
  {
    idNumber: 'SEC-PB31-01',
    name: 'Ms. Jocelyn Reyes',
    email: 'secretary.pb31@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
  {
    idNumber: 'DEAN-PB31-01',
    name: 'Dr. Felix Santos',
    email: 'dean.pb31@msunaawan.edu.ph',
    role: 'dean',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Dean',
  },
  {
    idNumber: 'CHR-PB31-01',
    name: 'Dr. Marisa Torres',
    email: 'chair.pb31@msunaawan.edu.ph',
    role: 'chairperson',
    origin: 'CESS',
    department: 'Department of Communication and Media Studies',
    position: 'Department Chairperson',
  },
  {
    idNumber: 'FAC-PB31-01',
    name: 'Prof. Rolando Mata',
    email: 'faculty.pb31@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Communication and Media Studies',
    position: 'Faculty',
  },
];

const seededAccounts = {};

async function seedTestUsers() {
  for (const u of TEST_USERS) {
    let existing = await UserModel.findByEmail(u.email);
    if (!existing) {
      existing = await provisionVerifiedUser({ ...u, password: 'password123' });
    }
    seededAccounts[u.idNumber] = existing;
    seededAccounts[u.role] = existing;
  }
}

// ---------------------------------------------------------------------------
// HTTP helper (mirrors test-pb33 pattern)
// ---------------------------------------------------------------------------
async function request(method, path, { email, body } = {}) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      'http://localhost:5001' + path,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(email ? { 'x-user-email': email } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------
function assert(condition, label) {
  if (!condition) {
    throw new Error(`FAILED: ${label}`);
  }
  console.log(`   ✅ ${label}`);
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING PB-31 INTEGRATION TESTS: EXTERNAL OFFICE TRANSFERS');
  console.log('   SRS §3.8 — REQ-EXT-1 to REQ-EXT-7');
  console.log('================================================================\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(5001, () => resolve());
  });

  try {
    await seedTestUsers();
    console.log('✅ Test accounts ready.\n');

    const student = seededAccounts['STU-PB31-01'];
    const secretary = seededAccounts['SEC-PB31-01'];
    const dean = seededAccounts['DEAN-PB31-01'];
    const chairperson = seededAccounts['CHR-PB31-01'];
    const faculty = seededAccounts['FAC-PB31-01'];

    // -----------------------------------------------------------------------
    // Setup: Student submits a document → Secretary routes → Chair endorses →
    //        Dean approves → document lands back at College Secretary (Under_Review)
    // -----------------------------------------------------------------------
    console.log('📄 Creating test document request...');
    const submitRes = await request('POST', '/api/documents', {
      email: student.email,
      body: {
        title: 'Request for Official Transcript PB-31',
        description: 'Requesting official transcript for employment application.',
        attachments: [
          {
            name: 'Application_Letter.pdf',
            sizeKb: 180,
            type: 'application/pdf',
          },
        ],
      },
    });
    if (submitRes.status !== 200 && submitRes.status !== 201) {
      throw new Error(`Failed to submit test doc: ${JSON.stringify(submitRes.body)}`);
    }
    const createdDoc = submitRes.body.document || submitRes.body;
    const docId = createdDoc.document_id;
    console.log(`   ✅ Document created: ${createdDoc.control_number} (${docId})\n`);

    // Advance doc through the workflow to reach College Secretary post-approval
    await request('POST', `/api/documents/${docId}/check`, {
      email: secretary.email,
      body: { decision: 'complete', remarks: 'Requirements verified — routing to Chairperson.' },
    });
    await request('POST', `/api/documents/${docId}/review`, {
      email: chairperson.email,
      body: { action: 'endorse', remarks: 'Endorsed by Chairperson.' },
    });
    await request('POST', `/api/documents/${docId}/review`, {
      email: dean.email,
      body: { action: 'approve', remarks: 'Approved by College Dean.' },
    });
    console.log('   ✅ Document approved by College Dean — now Under_Review at College Secretary.\n');

    // Confirm doc is Under_Review at College Secretary before we test external transfer
    const beforeRes = await request('GET', `/api/documents/${docId}`, { email: secretary.email });
    assert(
      beforeRes.body.current_status === 'Under_Review',
      'REQ-EXT-1 precondition: document is Under_Review at College Secretary before external transfer'
    );

    // -----------------------------------------------------------------------
    // REQ-EXT-5: Only College Secretary can send to external office
    // -----------------------------------------------------------------------
    console.log('1️⃣  REQ-EXT-5: Secretary-only enforcement for send to external...');

    const studentSend = await request('POST', `/api/documents/${docId}/external`, {
      email: student.email,
      body: { officeName: 'HRMO', transferDate: new Date().toISOString(), handedBy: 'Student' },
    });
    assert(studentSend.status === 403, 'Student blocked from sending to external office (403)');

    const deanSend = await request('POST', `/api/documents/${docId}/external`, {
      email: dean.email,
      body: { officeName: 'HRMO', transferDate: new Date().toISOString() },
    });
    assert(deanSend.status === 403, 'College Dean blocked from sending to external office (403)');

    const chairSend = await request('POST', `/api/documents/${docId}/external`, {
      email: chairperson.email,
      body: { officeName: 'HRMO', transferDate: new Date().toISOString() },
    });
    assert(chairSend.status === 403, 'Chairperson blocked from sending to external office (403)');

    const facSend = await request('POST', `/api/documents/${docId}/external`, {
      email: faculty.email,
      body: { officeName: 'HRMO', transferDate: new Date().toISOString() },
    });
    assert(facSend.status === 403, 'Faculty blocked from sending to external office (403)');

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-1 & REQ-EXT-2: Secretary sends document to HRMO
    // -----------------------------------------------------------------------
    console.log('2️⃣  REQ-EXT-1 & REQ-EXT-2: Secretary records external transfer to HRMO...');

    const transferDate = new Date().toISOString();
    const sendRes = await request('POST', `/api/documents/${docId}/external`, {
      email: secretary.email,
      body: {
        officeName: 'HRMO',
        transferDate,
        handedBy: 'Ms. Jocelyn Reyes',
        referenceNumber: 'HRMO-2026-001',
        remarks: 'Forwarded for employment verification clearance.',
      },
    });
    assert(
      sendRes.status === 200 || sendRes.status === 201,
      `REQ-EXT-1: Secretary successfully sends document to HRMO (status ${sendRes.status})`
    );
    assert(
      sendRes.body.document?.current_status === 'With_External_Office' ||
      sendRes.body.current_status === 'With_External_Office',
      'REQ-EXT-4: Document status updated to With_External_Office'
    );

    // REQ-EXT-4: Verify via GET
    const afterSendRes = await request('GET', `/api/documents/${docId}`, { email: secretary.email });
    assert(
      afterSendRes.body.current_status === 'With_External_Office',
      'REQ-EXT-4: GET confirms status is With_External_Office'
    );

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-2: Verify history entry contains all required fields
    // -----------------------------------------------------------------------
    console.log('3️⃣  REQ-EXT-2: Verify Sent_External history entry contains all required fields...');

    const historyRes = await request('GET', `/api/documents/${docId}/history`, {
      email: secretary.email,
    });
    assert(
      historyRes.status === 200,
      'History endpoint returns 200'
    );
    const history = historyRes.body.history || historyRes.body || [];
    const sentEntry = [...history].reverse().find((h) => h.action_type === 'Sent_External');
    assert(!!sentEntry, 'REQ-EXT-2: Sent_External history entry exists');
    assert(
      sentEntry.action_remarks && sentEntry.action_remarks.includes('HRMO'),
      'REQ-EXT-2: Remarks include external office name (HRMO)'
    );
    assert(
      sentEntry.action_remarks.includes('Ms. Jocelyn Reyes'),
      'REQ-EXT-2: Remarks include handed-by person'
    );
    assert(
      sentEntry.action_remarks.includes('HRMO-2026-001'),
      'REQ-EXT-2: Remarks include reference number'
    );
    assert(
      sentEntry.action_remarks.includes('employment verification'),
      'REQ-EXT-2: Remarks include notes/remarks field'
    );

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-5: Double-send is blocked (already With_External_Office)
    // -----------------------------------------------------------------------
    console.log('4️⃣  REQ-EXT-1: Prevent double-send while already With_External_Office...');

    const doubleSend = await request('POST', `/api/documents/${docId}/external`, {
      email: secretary.email,
      body: { officeName: 'Registrar', transferDate: new Date().toISOString() },
    });
    assert(
      doubleSend.status === 400,
      'REQ-EXT-1: Double-send blocked (400) — document already with external office'
    );

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-6: Secretary can view external transfers queue
    // -----------------------------------------------------------------------
    console.log('5️⃣  REQ-EXT-6: Secretary views pending external transfers queue...');

    const queueRes = await request('GET', '/api/documents/external', { email: secretary.email });
    assert(queueRes.status === 200, 'REQ-EXT-6: External transfers queue endpoint returns 200');
    const queue = queueRes.body.pendingExternalTransfers || [];
    assert(Array.isArray(queue), 'REQ-EXT-6: Queue response is an array');
    const inQueue = queue.find((d) => d.documentId === docId || d.controlNumber === createdDoc.control_number);
    assert(!!inQueue, 'REQ-EXT-6: Test document appears in pending external transfers queue');
    assert(
      inQueue.externalOfficeName && inQueue.externalOfficeName.includes('HRMO'),
      'REQ-EXT-6: Queue entry shows the external office name (HRMO)'
    );
    assert(
      typeof inQueue.daysWaiting === 'number',
      'REQ-EXT-4: Queue entry includes daysWaiting counter'
    );

    // Non-secretary cannot access the external transfers queue
    const studentQueue = await request('GET', '/api/documents/external', { email: student.email });
    assert(studentQueue.status === 403, 'REQ-EXT-5: Student blocked from external transfers queue (403)');

    const deanQueue = await request('GET', '/api/documents/external', { email: dean.email });
    assert(deanQueue.status === 403, 'REQ-EXT-5: Dean blocked from external transfers queue (403)');

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-5: Only Secretary can record return
    // -----------------------------------------------------------------------
    console.log('6️⃣  REQ-EXT-5: Secretary-only enforcement for recording return...');

    const studentReturn = await request('POST', `/api/documents/${docId}/external-return`, {
      email: student.email,
      body: { returnDate: new Date().toISOString(), outcome: 'completed', returnNotes: 'All clear.' },
    });
    assert(studentReturn.status === 403, 'Student blocked from recording external return (403)');

    const deanReturn = await request('POST', `/api/documents/${docId}/external-return`, {
      email: dean.email,
      body: { returnDate: new Date().toISOString(), outcome: 'completed' },
    });
    assert(deanReturn.status === 403, 'College Dean blocked from recording external return (403)');

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-3 & REQ-EXT-4: Secretary records return from HRMO
    // -----------------------------------------------------------------------
    console.log('7️⃣  REQ-EXT-3 & REQ-EXT-4: Secretary records return from HRMO...');

    const returnDate = new Date().toISOString();
    const returnRes = await request('POST', `/api/documents/${docId}/external-return`, {
      email: secretary.email,
      body: {
        returnDate,
        outcome: 'completed',
        returnNotes: 'HRMO cleared the document. Employment verification approved.',
      },
    });
    assert(
      returnRes.status === 200 || returnRes.status === 201,
      `REQ-EXT-3: Secretary successfully records return from HRMO (status ${returnRes.status})`
    );
    assert(
      returnRes.body.document?.current_status === 'Under_Review' ||
      returnRes.body.current_status === 'Under_Review',
      'REQ-EXT-4: Document status restored to Under_Review after return'
    );

    // Confirm via GET
    const afterReturnRes = await request('GET', `/api/documents/${docId}`, { email: secretary.email });
    assert(
      afterReturnRes.body.current_status === 'Under_Review',
      'REQ-EXT-4: GET confirms status is Under_Review after external return'
    );

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-3: Verify Returned_External history entry exists with all fields
    // -----------------------------------------------------------------------
    console.log('8️⃣  REQ-EXT-3: Verify Returned_External history entry in permanent history...');

    const historyAfterReturn = await request('GET', `/api/documents/${docId}/history`, {
      email: secretary.email,
    });
    const historyArr2 = historyAfterReturn.body.history || historyAfterReturn.body || [];
    const returnEntry = [...historyArr2].reverse().find((h) => h.action_type === 'Returned_External');
    assert(!!returnEntry, 'REQ-EXT-3: Returned_External history entry exists');
    assert(
      returnEntry.action_remarks && returnEntry.action_remarks.includes('HRMO'),
      'REQ-EXT-3: Return remarks reference the external office name'
    );
    assert(
      returnEntry.action_remarks.includes('completed'),
      'REQ-EXT-3: Return remarks include the outcome field'
    );
    assert(
      returnEntry.action_remarks.includes('HRMO cleared'),
      'REQ-EXT-3: Return remarks include return notes'
    );

    // Both history entries must coexist (complete audit trail)
    const sentCount = historyArr2.filter((h) => h.action_type === 'Sent_External').length;
    const returnCount = historyArr2.filter((h) => h.action_type === 'Returned_External').length;
    assert(sentCount >= 1, 'REQ-EXT-2: Sent_External entry persists in history after return');
    assert(returnCount >= 1, 'REQ-EXT-3: Returned_External entry added to permanent history');

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-1: Return-without-send is blocked (not currently With_External_Office)
    // -----------------------------------------------------------------------
    console.log('9️⃣  REQ-EXT-3: Return blocked when document is not With_External_Office...');

    const orphanReturn = await request('POST', `/api/documents/${docId}/external-return`, {
      email: secretary.email,
      body: { returnDate: new Date().toISOString(), outcome: 'completed' },
    });
    assert(
      orphanReturn.status === 400,
      'REQ-EXT-3: Return blocked (400) — document is not currently with an external office'
    );

    console.log();

    // -----------------------------------------------------------------------
    // REQ-EXT-7: Structural verification — no external office accounts needed
    // -----------------------------------------------------------------------
    console.log('🔟  REQ-EXT-7: Structural — all actions use Secretary credentials only...');
    console.log('   ✅ REQ-EXT-7: All above tests passed using only Secretary credentials.');
    console.log('   ✅ REQ-EXT-7: No external office user accounts were created or required.');

    console.log();

    // -----------------------------------------------------------------------
    // All tests passed
    // -----------------------------------------------------------------------
    console.log('================================================================');
    console.log('✅ ALL PB-31 INTEGRATION TESTS PASSED (REQ-EXT-1 to REQ-EXT-7)');
    console.log('================================================================\n');

  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
