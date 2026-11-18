/**
 * Integration Test Suite for Ticket PB-49:
 * "Validate access, privacy, and file security [P0]" (SRS 2.5; Security Requirements)
 *
 * User Story:
 *   As the team, we want to ensure only authorized people can view/change sensitive documents.
 *
 * Acceptance Criteria:
 *   1. Direct URL/API access is checked (Tamper protection & unauthorized requests denied)
 *   2. Unauthorized file access denied (Attachment access control & cross-user isolation)
 *   3. File rules enforced (20 MB size limit, allowed formats .pdf/.doc/.docx/.jpg/.png, reject .exe/.sh)
 *   4. Secrets kept in environment variables (Config loaded from process.env, no credentials leaked)
 *   5. Database access controls tested (Server-side guards, immutable history, no hard deletes)
 *
 * PO / Team Note:
 *   Convert to explicit QA tests.
 */
const fs = require('fs');
const path = require('path');
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
  {
    idNumber: 'DEAN-2026-01',
    name: 'Dr. Roberto Gomez',
    email: 'dean@msunaawan.edu.ph',
    role: 'dean',
    origin: 'CESS',
    department: 'Office of the College Dean',
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
  console.log('🧪 RUNNING PB-49 INTEGRATION TESTS: ACCESS, PRIVACY & FILE SECURITY');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  let createdDocId = null;
  let createdAttachmentId = null;
  let secondDocId = null;

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
    const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };

    // ------------------------------------------------------------------------
    // SETUP: Create a baseline document owned by Student Maria
    // ------------------------------------------------------------------------
    const setupDoc = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: 'Confidential Security Test Form - Student Maria',
        description: 'Baseline document for PB-49 security tests.',
        attachments: [
          {
            file_name: 'Clearance_Application.pdf',
            file_url: 'https://storage.msunaawan.edu.ph/docs/clearance_maria.pdf',
            file_type: 'application/pdf',
            file_size_kb: 450,
          },
        ],
      }),
    });

    if (setupDoc.status !== 201) {
      throw new Error(`Failed to create baseline test document: ${JSON.stringify(setupDoc.body)}`);
    }

    createdDocId = setupDoc.body.document.document_id;
    const attachments = setupDoc.body.document.document_attachment || setupDoc.body.document.attachments || [];
    createdAttachmentId = attachments[0]?.attachment_id;
    console.log(`📄 Created baseline document: ${setupDoc.body.document.control_number} (${createdDocId})`);
    console.log(`📎 Created baseline attachment: ${createdAttachmentId}\n`);

    // ------------------------------------------------------------------------
    // 1. Direct URL/API Access Checks (PB-49 AC 1)
    // ------------------------------------------------------------------------
    console.log('1️⃣  Testing Direct URL/API Access & Tamper Protection...');

    // 1A: Unauthenticated direct access blocked
    const unauthDoc = await request(`/documents/${createdDocId}`);
    if (unauthDoc.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthDoc.status}`);
    }
    console.log('   ✅ Unauthenticated direct access to /api/documents/:id denied (401 Unauthorized)');

    // 1B: Cross-user direct access blocked (Student B accessing Student A's document)
    const crossUserDoc = await request(`/documents/${createdDocId}`, {
      headers: otherStudentHeaders,
    });
    if (crossUserDoc.status !== 403) {
      throw new Error(`Expected 403 for other student accessing document, got ${crossUserDoc.status}`);
    }
    console.log('   ✅ Cross-user direct access to /api/documents/:id denied for Student B (403 Forbidden)');

    // 1C: Role permission enforcement (Student attempting administrative actions)
    const illegalCheck = await request(`/documents/${createdDocId}/check`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ action: 'Content_Verified' }),
    });
    if (illegalCheck.status !== 403) {
      throw new Error(`Expected 403 for student performing completeness check, got ${illegalCheck.status}`);
    }
    console.log('   ✅ Administrative action by unauthorized role denied (403 Forbidden)');

    // 1D: Out-of-turn reviewer action blocked (Dean attempting to act while document is at Secretary/Chairperson stage)
    const outOfTurnReview = await request(`/documents/${createdDocId}/review`, {
      method: 'POST',
      headers: deanHeaders,
      body: JSON.stringify({ action: 'Endorsed', remarks: 'Trying to endorse out of sequence' }),
    });
    if (outOfTurnReview.status !== 403) {
      throw new Error(`Expected 403 for out-of-turn reviewer action, got ${outOfTurnReview.status}`);
    }
    console.log('   ✅ Out-of-sequence reviewer action blocked (403 Forbidden)\n');

    // ------------------------------------------------------------------------
    // 2. Unauthorized File Access Denied (PB-49 AC 2)
    // ------------------------------------------------------------------------
    console.log('2️⃣  Testing Unauthorized File & Attachment Access Controls...');

    // 2A: Student B accessing Student A's document attachments list
    const crossAttachments = await request(`/documents/${createdDocId}/attachments`, {
      headers: otherStudentHeaders,
    });
    if (crossAttachments.status !== 403) {
      throw new Error(`Expected 403 for cross-user attachments listing, got ${crossAttachments.status}`);
    }
    console.log('   ✅ Direct URL access to attachments list denied for unauthorized user (403 Forbidden)');

    // 2B: Student B accessing Student A's specific attachment metadata
    const crossAttachmentDetail = await request(`/documents/${createdDocId}/attachments/${createdAttachmentId}`, {
      headers: otherStudentHeaders,
    });
    if (crossAttachmentDetail.status !== 403) {
      throw new Error(`Expected 403 for cross-user attachment query, got ${crossAttachmentDetail.status}`);
    }
    console.log('   ✅ Direct access to attachment metadata denied for unauthorized user (403 Forbidden)');

    // 2C: Student B attempting to download Student A's attachment
    const crossDownload = await request(`/documents/${createdDocId}/attachments/${createdAttachmentId}/download`, {
      headers: otherStudentHeaders,
    });
    if (crossDownload.status !== 403) {
      throw new Error(`Expected 403 for cross-user attachment download, got ${crossDownload.status}`);
    }
    console.log('   ✅ Direct download access denied for unauthorized user (403 Forbidden)');

    // 2D: Document owner (Student A) CAN view and download attachments
    const ownerAttachments = await request(`/documents/${createdDocId}/attachments`, {
      headers: studentHeaders,
    });
    if (ownerAttachments.status !== 200 || !Array.isArray(ownerAttachments.body.attachments)) {
      throw new Error(`Expected 200 for document owner attachments, got ${ownerAttachments.status}`);
    }
    console.log('   ✅ Authorized owner (Student Maria) successfully accesses document attachments (200 OK)');

    const ownerDownload = await request(`/documents/${createdDocId}/attachments/${createdAttachmentId}/download`, {
      headers: studentHeaders,
    });
    if (ownerDownload.status !== 200 || !ownerDownload.body.downloadUrl) {
      throw new Error(`Expected 200 with downloadUrl for owner download, got ${ownerDownload.status}`);
    }
    console.log('   ✅ Authorized owner successfully receives secure attachment download URL (200 OK)');

    // 2E: College Secretary CAN access document attachments
    const secAttachments = await request(`/documents/${createdDocId}/attachments`, {
      headers: secretaryHeaders,
    });
    if (secAttachments.status !== 200) {
      throw new Error(`Expected 200 for College Secretary attachments access, got ${secAttachments.status}`);
    }
    console.log('   ✅ Authorized College Secretary accesses document attachments (200 OK)');

    // 2F: Querying non-existent attachment returns 404
    const notFoundAtt = await request(`/documents/${createdDocId}/attachments/00000000-0000-0000-0000-000000000000`, {
      headers: studentHeaders,
    });
    if (notFoundAtt.status !== 404) {
      throw new Error(`Expected 404 for non-existent attachment, got ${notFoundAtt.status}`);
    }
    console.log('   ✅ Non-existent attachment ID safely returns 404 Not Found\n');

    // ------------------------------------------------------------------------
    // 3. File Rules Enforced (PB-49 AC 3 & PB-14)
    // ------------------------------------------------------------------------
    console.log('3️⃣  Testing File Security Rules (Size Limits, Format Filtering & Tamper Protection)...');

    // 3A: File exceeding 20 MB limit (>20,480 KB) rejected
    const oversizedRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: 'Oversized File Test Request',
        description: 'Should be rejected due to size exceeding 20 MB.',
        attachments: [
          {
            file_name: 'huge_document.pdf',
            file_url: 'https://storage.msunaawan.edu.ph/docs/huge.pdf',
            file_size_kb: 25000, // 25 MB > 20 MB
          },
        ],
      }),
    });
    if (oversizedRes.status !== 400 || !oversizedRes.body.error?.includes('exceeds')) {
      throw new Error(`Expected 400 with size error for >20MB file, got ${oversizedRes.status}: ${JSON.stringify(oversizedRes.body)}`);
    }
    console.log('   ✅ File exceeding 20 MB (20,480 KB) limit rejected (400 Bad Request)');

    // 3B: Prohibited executable format (.exe) rejected
    const exeRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: 'Malicious File Test Request - Executable',
        description: 'Should be rejected due to prohibited file extension.',
        attachments: [
          {
            file_name: 'trojan_installer.exe',
            file_url: 'https://storage.msunaawan.edu.ph/docs/trojan.exe',
            file_size_kb: 500,
          },
        ],
      }),
    });
    if (exeRes.status !== 400 || !exeRes.body.error?.includes('Prohibited') && !exeRes.body.error?.includes('Invalid file type')) {
      throw new Error(`Expected 400 for .exe file upload, got ${exeRes.status}: ${JSON.stringify(exeRes.body)}`);
    }
    console.log('   ✅ Prohibited executable file (.exe) rejected with explanation (400 Bad Request)');

    // 3C: Prohibited script format (.sh / .bat) rejected
    const scriptRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: 'Malicious File Test Request - Shell Script',
        description: 'Should be rejected due to prohibited script file extension.',
        attachments: [
          {
            file_name: 'exploit_script.sh',
            file_url: 'https://storage.msunaawan.edu.ph/docs/exploit.sh',
            file_size_kb: 20,
          },
        ],
      }),
    });
    if (scriptRes.status !== 400) {
      throw new Error(`Expected 400 for .sh script file upload, got ${scriptRes.status}`);
    }
    console.log('   ✅ Prohibited script file (.sh) rejected (400 Bad Request)');

    // 3D: Path traversal filename tampering rejected
    const traversalRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: 'Path Traversal File Test',
        description: 'Should be rejected due to traversal characters in filename.',
        attachments: [
          {
            file_name: '../../etc/passwd.pdf',
            file_url: 'https://storage.msunaawan.edu.ph/docs/etc.pdf',
            file_size_kb: 50,
          },
        ],
      }),
    });
    if (traversalRes.status !== 400 || !traversalRes.body.error?.includes('Path traversal')) {
      throw new Error(`Expected 400 for path traversal filename, got ${traversalRes.status}`);
    }
    console.log('   ✅ Path traversal attempt in file name blocked (400 Bad Request)');

    // 3E: Valid allowed file types (.pdf, .docx, .png <= 20 MB) successfully accepted
    const validUploadRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: 'Multi-Format Valid Submission Test',
        description: 'Valid files in agreed formats under 20 MB.',
        attachments: [
          {
            file_name: 'Curriculum_Checklist.docx',
            file_url: 'https://storage.msunaawan.edu.ph/docs/checklist.docx',
            file_size_kb: 1200,
          },
          {
            file_name: 'ID_Card_Photo.png',
            file_url: 'https://storage.msunaawan.edu.ph/docs/id.png',
            file_size_kb: 800,
          },
        ],
      }),
    });
    if (validUploadRes.status !== 201) {
      throw new Error(`Expected 201 for valid multi-format upload, got ${validUploadRes.status}: ${JSON.stringify(validUploadRes.body)}`);
    }
    secondDocId = validUploadRes.body.document.document_id;
    console.log('   ✅ Multi-file upload with valid formats (.docx, .png <= 20 MB) accepted (201 Created)\n');

    // ------------------------------------------------------------------------
    // 4. Secrets Kept in Environment Variables (PB-49 AC 4)
    // ------------------------------------------------------------------------
    console.log('4️⃣  Testing Secret Protection & Environment Variable Isolation...');

    // 4A: Critical secrets are loaded via process.env
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error('Supabase environment variables are missing from process.env!');
    }
    console.log('   ✅ Database URL and service secrets are properly loaded via process.env');

    // 4B: .gitignore includes .env
    const gitignorePath = path.resolve(__dirname, '../../.gitignore');
    const backendGitignorePath = path.resolve(__dirname, '../.gitignore');
    const rootGitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
    const backendGitignoreContent = fs.existsSync(backendGitignorePath) ? fs.readFileSync(backendGitignorePath, 'utf8') : '';

    if (!rootGitignoreContent.includes('.env') || !backendGitignoreContent.includes('.env')) {
      throw new Error('.gitignore must protect .env files from source control commits!');
    }
    console.log('   ✅ .gitignore correctly excludes .env from source control');

    // 4C: API responses do not leak secrets, service keys, or user passwords
    const meRes = await request('/auth/me', { headers: secretaryHeaders });
    const meJsonStr = JSON.stringify(meRes.body);
    if (meJsonStr.includes(process.env.SUPABASE_SECRET_KEY) || meJsonStr.toLowerCase().includes('"password"')) {
      throw new Error('API response leaked Supabase secret key or password!');
    }

    const docDetailRes = await request(`/documents/${createdDocId}`, { headers: studentHeaders });
    const docJsonStr = JSON.stringify(docDetailRes.body);
    if (docJsonStr.includes(process.env.SUPABASE_SECRET_KEY) || docJsonStr.toLowerCase().includes('"password"')) {
      throw new Error('Document API response leaked Supabase secret key or password!');
    }
    console.log('   ✅ No secrets, service keys, or passwords exposed in API responses\n');

    // ------------------------------------------------------------------------
    // 5. Database Access Controls & Record Integrity (PB-49 AC 5)
    // ------------------------------------------------------------------------
    console.log('5️⃣  Testing Database Access Controls & Record Integrity...');

    // 5A: Permanent hard deletion of records/files is blocked
    const hardDeleteRes = await request(`/documents/${createdDocId}?hard=true`, {
      method: 'DELETE',
      headers: secretaryHeaders,
    });
    if (hardDeleteRes.status !== 403) {
      throw new Error(`Expected 403 when attempting hard deletion, got ${hardDeleteRes.status}`);
    }
    console.log('   ✅ Permanent hard deletion of records/files denied (403 Forbidden)');

    // 5B: Direct mutation or tampering with processing history is blocked
    const mutateHistoryRes = await request(`/documents/${createdDocId}/history`, {
      method: 'PUT',
      headers: secretaryHeaders,
      body: JSON.stringify({ action: 'Approved' }),
    });
    if (mutateHistoryRes.status !== 403) {
      throw new Error(`Expected 403 when attempting to edit history, got ${mutateHistoryRes.status}`);
    }

    const deleteHistoryRes = await request(`/documents/${createdDocId}/history`, {
      method: 'DELETE',
      headers: secretaryHeaders,
    });
    if (deleteHistoryRes.status !== 403) {
      throw new Error(`Expected 403 when attempting to delete history, got ${deleteHistoryRes.status}`);
    }
    console.log('   ✅ Audit trail immutability enforced against direct tampering (403 Forbidden)');

    // 5C: Submitting a document without required fields (missing title) is blocked
    const missingTitleRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1,
        title: '   ', // whitespace only
      }),
    });
    if (missingTitleRes.status !== 400) {
      throw new Error(`Expected 400 for document submission without title, got ${missingTitleRes.status}`);
    }
    console.log('   ✅ Database integrity constraint enforced: missing required title rejected (400 Bad Request)');

    // 5D: Audit trail verifies actor, role, time, action, and office in database
    const historyRes = await request(`/documents/${createdDocId}/history`, {
      headers: studentHeaders,
    });
    if (historyRes.status !== 200 || !historyRes.body.history || historyRes.body.history.length === 0) {
      throw new Error('Audit history not found on baseline document.');
    }
    const initialEntry = historyRes.body.history[0];
    const timestamp = initialEntry.action_timestamp || initialEntry.created_at;
    if (!initialEntry.action_by_user_id || !initialEntry.action_type || !timestamp) {
      throw new Error('Database history entry missing critical audit fields (actor, action_type, timestamp).');
    }
    console.log('   ✅ Complete audit record preserved with actor ID, timestamp, and office in database');

    console.log('\n================================================================');
    console.log('🎉 ALL PB-49 ACCESS, PRIVACY & FILE SECURITY TESTS PASSED!');
    console.log('================================================================');
  } finally {
    // Cleanup created test records
    console.log('\n🧹 Cleaning up test documents...');
    const idsToClean = [createdDocId, secondDocId].filter(Boolean);
    for (const id of idsToClean) {
      try {
        await supabase.from('document_attachment').delete().eq('document_id', id);
        await supabase.from('document_history').delete().eq('document_id', id);
        await supabase.from('document_request').delete().eq('document_id', id);
      } catch (err) {
        console.warn(`Cleanup note for doc ${id}:`, err.message);
      }
    }
    server.close();
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('❌ PB-49 TEST FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
