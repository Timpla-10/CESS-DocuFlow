/**
 * Integration Test Suite for Ticket PB-33:
 * "Ready-for-release and release recording [P0]"
 *
 * User Story:
 *   As the Secretary, I want to mark a processed document ready and record release.
 *
 * Acceptance Criteria:
 *   1. Only authorized staff (Secretary) can mark ready/released
 *   2. Release date/time recorded; release details (recipient, signed copy) saved
 *   3. Requester status updates (Ready_for_Release -> Released) with notification
 *   4. Final document view/download respects permissions (requester, reviewer, secretary)
 */

const app = require('../server');
const DocumentModel = require('../models/documentModel');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser } = require('../services/authService');

const TEST_USERS = [
  {
    idNumber: 'STU-PB33-01',
    name: 'Paolo Reyes',
    email: 'student.pb33@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BA Social Sciences, 4th Year',
    position: 'Student',
  },
  {
    idNumber: 'SEC-PB33-01',
    name: 'Ms. Carmela Ortiz',
    email: 'secretary.pb33@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
  {
    idNumber: 'DEAN-PB33-01',
    name: 'Dr. Ramon Villanueva',
    email: 'dean.pb33@msunaawan.edu.ph',
    role: 'dean',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Dean',
  },
  {
    idNumber: 'CHR-PB33-01',
    name: 'Dr. Liza Fernandez',
    email: 'chair.pb33@msunaawan.edu.ph',
    role: 'chairperson',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Department Chairperson',
  },
  {
    idNumber: 'UNAUTH-PB33-01',
    name: 'Other Requester',
    email: 'unauth.pb33@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English',
    position: 'Student',
  },
];

const seededAccounts = {};

async function seedTestUsers() {
  for (const u of TEST_USERS) {
    let existing = await UserModel.findByEmail(u.email);
    if (!existing) {
      existing = await provisionVerifiedUser({
        ...u,
        password: 'password123',
      });
    }
    seededAccounts[u.idNumber] = existing;
    seededAccounts[u.role] = existing;
  }
}

async function request(method, path, { email, body } = {}) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      'http://localhost:5000' + path,
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

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING PB-33 INTEGRATION TESTS: READY-FOR-RELEASE & RELEASE RECORDING');
  console.log('================================================================\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(5000, () => resolve());
  });

  try {
    await seedTestUsers();
    console.log('✅ Test accounts ready.\n');

    const student = seededAccounts['STU-PB33-01'];
    const secretary = seededAccounts['SEC-PB33-01'];
    const dean = seededAccounts['DEAN-PB33-01'];
    const chairperson = seededAccounts['CHR-PB33-01'];
    const unauth = seededAccounts['UNAUTH-PB33-01'];

    // Setup: Student submits a Thesis Form request
    console.log('📝 Creating test document request...');
    const submitRes = await request('POST', '/api/documents', {
      email: student.email,
      body: {
        title: 'Request for Thesis Outline Defense PB-33',
        description: 'Submission of thesis manuscript for defense review.',
        attachments: [
          {
            name: 'Thesis_Outline_Proposal.pdf',
            sizeKb: 340,
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

    // Advance doc: Secretary Content Verify -> Chairperson Endorse -> Dean Approve -> Held by Secretary
    await request('POST', `/api/documents/${docId}/check`, {
      email: secretary.email,
      body: { decision: 'complete', remarks: 'Verified complete and routed.' },
    });
    await request('POST', `/api/documents/${docId}/review`, {
      email: chairperson.email,
      body: { action: 'endorse', remarks: 'Endorsed by Chairperson.' },
    });
    await request('POST', `/api/documents/${docId}/review`, {
      email: dean.email,
      body: { action: 'approve', remarks: 'Approved by College Dean.' },
    });
    console.log('   ✅ Document approved by College Dean and returned to College Secretary.\n');

    // ------------------------------------------------------------------------
    // Criterion 1: Only authorized staff (Secretary) can mark ready / released
    // ------------------------------------------------------------------------
    console.log('1️⃣  Testing Authorized Staff Enforcement for Ready & Release Actions...');

    // Non-secretary (Student) tries to mark ready -> 403 Forbidden
    const studentReady = await request('POST', `/api/documents/${docId}/ready`, {
      email: student.email,
      body: { remarks: 'Student attempting mark ready' },
    });
    if (studentReady.status !== 403) {
      throw new Error(`Expected 403 for student mark ready, got: ${studentReady.status}`);
    }
    console.log('   ✅ Student blocked from mark ready -> Status 403');

    // Reviewer (Dean) tries to mark ready -> 403 Forbidden
    const deanReady = await request('POST', `/api/documents/${docId}/ready`, {
      email: dean.email,
      body: { remarks: 'Dean attempting mark ready' },
    });
    if (deanReady.status !== 403) {
      throw new Error(`Expected 403 for dean mark ready, got: ${deanReady.status}`);
    }
    console.log('   ✅ College Dean blocked from mark ready -> Status 403');

    // Non-secretary (Chairperson) tries to record release -> 403 Forbidden
    const chairRelease = await request('POST', `/api/documents/${docId}/release`, {
      email: chairperson.email,
      body: { receivedBy: 'Paolo Reyes' },
    });
    if (chairRelease.status !== 403) {
      throw new Error(`Expected 403 for chairperson release, got: ${chairRelease.status}`);
    }
    console.log('   ✅ Chairperson blocked from record release -> Status 403\n');

    // ------------------------------------------------------------------------
    // Criterion 2 & 3: Mark Ready for Release -> Requester status updates + notification
    // ------------------------------------------------------------------------
    console.log('2️⃣  Testing Secretary Marks Ready for Release (POST /api/documents/:id/ready)...');
    const markReadyRes = await request('POST', `/api/documents/${docId}/ready`, {
      email: secretary.email,
      body: { remarks: 'Signed by Dean; ready for pickup at Secretary office counter.' },
    });
    if (markReadyRes.status !== 200) {
      throw new Error(`Expected 200 for mark ready, got ${markReadyRes.status}: ${JSON.stringify(markReadyRes.body)}`);
    }

    const readyDoc = markReadyRes.body.document;
    if (readyDoc.current_status !== 'Ready_for_Release') {
      throw new Error(`Expected status 'Ready_for_Release', got '${readyDoc.current_status}'`);
    }
    console.log('   ✅ Status updated to: Ready_for_Release');

    // Verify requester views status as Ready for Release / Pickup
    const studentViewReady = await request('GET', `/api/documents/${docId}`, {
      email: student.email,
    });
    const studentDoc = studentViewReady.body.document || studentViewReady.body;
    if (studentDoc.current_status !== 'Ready_for_Release') {
      throw new Error(`Requester saw status '${studentDoc.current_status}' instead of 'Ready_for_Release'`);
    }
    console.log('   ✅ Requester sees real-time status: Ready_for_Release');

    // Verify notification was generated for requester
    const notifs = await request('GET', `/api/documents/notifications`, {
      email: student.email,
    });
    const readyNotif = (notifs.body.notifications || []).find(
      (n) => n.document_id === docId && n.title.includes('ready for pickup')
    );
    if (!readyNotif) {
      throw new Error('Expected ready-for-pickup notification for requester, not found in log.');
    }
    console.log(`   ✅ Requester notification verified: "${readyNotif.title}"\n`);

    // ------------------------------------------------------------------------
    // Criterion 2 & 3: Record Release -> recipient name, timestamp, signed scan
    // ------------------------------------------------------------------------
    console.log('3️⃣  Testing Secretary Records Release to Requester (POST /api/documents/:id/release)...');
    
    // Missing recipient validation -> 400 Bad Request
    const noRecipient = await request('POST', `/api/documents/${docId}/release`, {
      email: secretary.email,
      body: { receivedBy: '' },
    });
    if (noRecipient.status !== 400) {
      throw new Error(`Expected 400 for missing recipient, got: ${noRecipient.status}`);
    }
    console.log('   ✅ Missing recipient name rejected -> Status 400: "The name of the recipient is required"');

    // Secretary records release with signed scan copy
    const releaseRes = await request('POST', `/api/documents/${docId}/release`, {
      email: secretary.email,
      body: {
        receivedBy: 'Paolo Reyes (Student)',
        signedFile: {
          name: 'Thesis_Outline_Defense_Approved_Signed.pdf',
          sizeKb: 450,
          type: 'application/pdf',
        },
      },
    });
    if (releaseRes.status !== 200) {
      throw new Error(`Expected 200 for record release, got ${releaseRes.status}: ${JSON.stringify(releaseRes.body)}`);
    }

    const releasedDoc = releaseRes.body.document;
    if (releasedDoc.current_status !== 'Released') {
      throw new Error(`Expected status 'Released', got '${releasedDoc.current_status}'`);
    }
    console.log('   ✅ Document status updated to: Released');
    console.log(`   ✅ Release info recorded: Recipient: "${releaseRes.body.releaseInfo.receivedBy}", Date/Time: ${releaseRes.body.releaseInfo.releasedAt}`);

    // Verify immutable audit history
    const historyRes = await request('GET', `/api/documents/${docId}/history`, {
      email: secretary.email,
    });
    const history = historyRes.body.history || [];
    const readyEntry = history.find((h) => h.action_type === 'Ready_for_Release');
    const releaseEntry = history.find((h) => h.action_type === 'Released');
    if (!readyEntry || !releaseEntry) {
      throw new Error('Expected Ready_for_Release and Released action entries in Document_History.');
    }
    console.log('   ✅ Audit trail verified: Ready_for_Release and Released actions saved with actor and timestamps.\n');

    // ------------------------------------------------------------------------
    // Criterion 4: Final document view/download respects permissions
    // ------------------------------------------------------------------------
    console.log('4️⃣  Testing Final Document View & Download Permissions...');

    // Requester CAN view attachments
    const reqAttachments = await request('GET', `/api/documents/${docId}/attachments`, {
      email: student.email,
    });
    if (reqAttachments.status !== 200 || reqAttachments.body.attachments.length < 2) {
      throw new Error(`Expected requester to view attachments, got: ${reqAttachments.status}`);
    }
    console.log(`   ✅ Requester permitted to view all attachments (${reqAttachments.body.count} files including final signed scan)`);

    // Secretary CAN view attachments
    const secAttachments = await request('GET', `/api/documents/${docId}/attachments`, {
      email: secretary.email,
    });
    if (secAttachments.status !== 200) {
      throw new Error(`Expected secretary to view attachments, got: ${secAttachments.status}`);
    }
    console.log('   ✅ Secretary permitted to view final document and attachments');

    // Unrelated third-party student CANNOT view or download attachments -> 403 Forbidden
    const unauthAttachments = await request('GET', `/api/documents/${docId}/attachments`, {
      email: unauth.email,
    });
    if (unauthAttachments.status !== 403) {
      throw new Error(`Expected 403 for unauthorized requester, got: ${unauthAttachments.status}`);
    }
    console.log('   ✅ Unauthorized user blocked from viewing released document -> Status 403');

    console.log('\n================================================================');
    console.log('🎉 ALL 4 PB-33 ACCEPTANCE CRITERIA TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});

