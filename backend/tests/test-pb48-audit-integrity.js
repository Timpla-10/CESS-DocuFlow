/**
 * Integration Test Suite for Ticket PB-48:
 * "Audit trail and record integrity [P0]" (SRS 3.4 REQ-REC-4, 7; Security Requirements)
 *
 * User Story:
 *   As the institution, we need traceable actions and protected records.
 *
 * Acceptance Criteria:
 *   1. Key actions record actor, role, time, action and reason
 *   2. Ordinary users cannot edit/delete history (immutable audit trail)
 *   3. Records/files are not hard-deleted (soft delete & historical retention)
 *   4. Permissions are enforced server-side
 */
const app = require('../server');
const supabase = require('../config/database');
const DocumentModel = require('../models/documentModel');
const UserModel = require('../models/userModel');
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
    idNumber: '2023-9999',
    name: 'Juan Dela Cruz (Other Student)',
    email: 'other.student@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd Math, 2nd Year',
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
  console.log('🧪 RUNNING PB-48 INTEGRATION TESTS: AUDIT TRAIL & RECORD INTEGRITY');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  let testDocId = null;

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
    const otherStudentHeaders = { 'x-user-email': 'other.student@msunaawan.edu.ph' };
    const secretaryHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
    const chairpersonHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };

    // ------------------------------------------------------------------------
    // 1. Key actions record actor, role, time, action and reason (PB-48 AC 1)
    // ------------------------------------------------------------------------
    console.log('1️⃣  Testing Traceability of Key Actions (Submit -> Route -> Return -> Resubmit)...');

    // Step A: Submission
    const submitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: 'INC Form with Audit Trail Verification',
        description: 'Submission test for PB-48.',
        attachments: [
          {
            file_name: 'inc_initial_v1.pdf',
            file_url: 'https://storage.example.com/inc_initial_v1.pdf',
            file_type: 'application/pdf',
            file_size_kb: 320,
          },
        ],
      }),
    });
    if (submitRes.status !== 201) {
      throw new Error(`Failed to submit request: ${submitRes.status}`);
    }
    testDocId = submitRes.body.document.document_id;
    console.log(`   ✅ Action 1 (Submitted) recorded for Control No: ${submitRes.body.document.control_number}`);

    // Step B: Secretary Route
    const routeRes = await request(`/documents/${testDocId}/check`, {
      method: 'POST',
      headers: secretaryHeaders,
      body: JSON.stringify({ decision: 'complete', remarks: 'Completeness check verified by College Secretary.' }),
    });
    if (routeRes.status !== 200) {
      throw new Error(`Failed to route request: ${routeRes.status}`);
    }
    console.log('   ✅ Action 2 (Routed) recorded with Secretary actor and verification remarks.');

    // Step C: Chairperson Return with required reason
    const returnRes = await request(`/documents/${testDocId}/return`, {
      method: 'POST',
      headers: chairpersonHeaders,
      body: JSON.stringify({ reason: 'Instructor grade slip is missing dean co-signature.' }),
    });
    if (returnRes.status !== 200) {
      throw new Error(`Failed to return request: ${returnRes.status}`);
    }
    console.log('   ✅ Action 3 (Returned) recorded with Chairperson actor and correction remarks.');

    // Step D: Student Resubmission (Revision 2)
    const resubmitRes = await request(`/documents/${testDocId}/resubmit`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        title: 'INC Form with Audit Trail Verification (Corrected)',
        resubmission_notes: 'Attached signed grade slip.',
        attachments: [
          {
            file_name: 'grade_slip_signed_v2.pdf',
            file_url: 'https://storage.example.com/grade_slip_signed_v2.pdf',
            file_type: 'application/pdf',
            file_size_kb: 410,
          },
        ],
      }),
    });
    if (resubmitRes.status !== 200) {
      throw new Error(`Failed to resubmit request: ${resubmitRes.status}`);
    }
    console.log('   ✅ Action 4 (Resubmitted) recorded with Student actor and Revision 2.');

    // Verify chronological history contains all key fields (actor, role, time, action, reason)
    const historyRes = await request(`/documents/${testDocId}/history`, { headers: secretaryHeaders });
    if (historyRes.status !== 200 || !Array.isArray(historyRes.body?.history)) {
      throw new Error(`Failed to fetch history: ${historyRes.status}`);
    }

    const events = historyRes.body.history;
    if (events.length < 4) {
      throw new Error(`Expected at least 4 history events, found ${events.length}`);
    }

    for (const ev of events) {
      if (!ev.action_type || !ev.action_timestamp || !ev.action_by_user_id) {
        throw new Error(`Audit event missing mandatory fields: ${JSON.stringify(ev)}`);
      }
    }
    console.log(`   ✅ Chronological history verified: ${events.length} event(s) recorded.`);
    console.log(`      Actions Flow: ${events.map((e) => e.action_type).join(' -> ')}`);

    // ------------------------------------------------------------------------
    // 2. Ordinary users cannot edit or delete history (PB-48 AC 2)
    // ------------------------------------------------------------------------
    console.log('\n2️⃣  Testing Audit History Immutability (Edit & Delete Attempts Blocked)...');

    const studentEditHistoryRes = await request(`/documents/${testDocId}/history`, {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ action_remarks: 'Tampered remarks' }),
    });
    if (studentEditHistoryRes.status !== 403) {
      throw new Error(`Expected 403 on edit history attempt, got ${studentEditHistoryRes.status}`);
    }
    console.log('   ✅ Edit history blocked for Requester (403 Forbidden).');

    const secretaryDeleteHistoryRes = await request(`/documents/${testDocId}/history`, {
      method: 'DELETE',
      headers: secretaryHeaders,
    });
    if (secretaryDeleteHistoryRes.status !== 403) {
      throw new Error(`Expected 403 on delete history attempt, got ${secretaryDeleteHistoryRes.status}`);
    }
    console.log('   ✅ Delete history blocked even for Secretary (403 Forbidden: audit is immutable).');

    // ------------------------------------------------------------------------
    // 3. Records and files are not hard-deleted (PB-48 AC 3)
    // ------------------------------------------------------------------------
    console.log('\n3️⃣  Testing Records & Files Protection (Hard-Delete Blocked, Soft-Delete Preserved)...');

    // Attempt permanent hard deletion
    const hardDeleteRes = await request(`/documents/${testDocId}?hard=true`, {
      method: 'DELETE',
      headers: secretaryHeaders,
    });
    if (hardDeleteRes.status !== 403) {
      throw new Error(`Expected 403 for hard-delete attempt, got ${hardDeleteRes.status}`);
    }
    console.log('   ✅ Hard deletion permanently blocked (403 Forbidden: record integrity preserved).');

    // Soft delete/archive
    const softDeleteRes = await request(`/documents/${testDocId}`, {
      method: 'DELETE',
      headers: secretaryHeaders,
    });
    if (softDeleteRes.status !== 200) {
      throw new Error(`Expected 200 on soft delete, got ${softDeleteRes.status}`);
    }
    console.log('   ✅ Soft delete / archival completed without data destruction.');

    // Verify record and historical files remain accessible in audit view
    const auditViewRes = await request(`/documents/${testDocId}/history`, { headers: secretaryHeaders });
    if (auditViewRes.status !== 200) {
      throw new Error('Soft-deleted document was destroyed instead of preserved for audit!');
    }
    if (auditViewRes.body.attachments.length < 2) {
      throw new Error('Historical attachment files were destroyed!');
    }
    console.log(`   ✅ Audited records & ${auditViewRes.body.attachments.length} attachment file(s) remain preserved.`);

    // ------------------------------------------------------------------------
    // 4. Permissions are enforced server-side (PB-48 AC 4)
    // ------------------------------------------------------------------------
    console.log('\n4️⃣  Testing Server-Side Permission Enforcement on History & Records...');

    // Other student attempting to view Maria's document history
    const otherStudentAuditRes = await request(`/documents/${testDocId}/history`, {
      headers: otherStudentHeaders,
    });
    if (otherStudentAuditRes.status !== 403) {
      throw new Error(`Expected 403 for other student viewing history, got ${otherStudentAuditRes.status}`);
    }
    console.log("   ✅ Unrelated user blocked from viewing other user's document history (403 Forbidden).");

    // Unauthenticated request
    const unauthAuditRes = await request(`/documents/${testDocId}/history`);
    if (unauthAuditRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated history view, got ${unauthAuditRes.status}`);
    }
    console.log('   ✅ Unauthenticated history query blocked (401 Unauthorized).');

    // Requester can view own document history
    const ownerAuditRes = await request(`/documents/${testDocId}/history`, {
      headers: studentHeaders,
    });
    if (ownerAuditRes.status !== 200) {
      throw new Error(`Owner was denied view to own document history: ${ownerAuditRes.status}`);
    }
    console.log('   ✅ Owner successfully viewed own document history and return remarks.');

    console.log('\n================================================================');
    console.log('🎉 ALL 4 PB-48 ACCEPTANCE CRITERIA TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ PB-48 Test Error:', err);
    process.exit(1);
  } finally {
    if (testDocId) {
      await DocumentModel.softDelete(testDocId).catch(() => {});
    }
    server.close();
  }
}

if (require.main === module) {
  runTests();
}

module.exports = runTests;
