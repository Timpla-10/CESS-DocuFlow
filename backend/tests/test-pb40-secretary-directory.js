/**
 * Integration Test Suite for Ticket PB-40:
 * "Secretary manages syllabus templates and listings [P1]"
 *
 * Acceptance Criteria & PO Note Verified:
 *   1. Authorized Secretary can upload/replace official syllabus template
 *   2. Future downloads use the updated current template
 *   3. Existing faculty syllabi are NEVER silently overwritten (plus overwrite=false 409 guard & history)
 *   4. Template & directory listing changes are traceable
 *   5. Only Secretary can manage templates & approved directory listings (403 for non-Secretary)
 *   6. PO Note: Syllabus-template replacement automatically creates a published announcement
 */
const assert = require('assert');
const { initializeStagingTestEnvironment } = require('./stagingSafetyGuard');

// Fail closed BEFORE importing ../server or ../config/database so no Supabase client
// is initialized unless explicitly targeting the verified staging Supabase project.
initializeStagingTestEnvironment();

const app = require('../server');
const DirectoryModel = require('../models/directoryModel');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser, getPasswordsForRole } = require('../services/authService');

const ACCOUNTS = [
  { idNumber: '2023-0142', name: 'Maria Santos', email: 'student@msunaawan.edu.ph', role: 'student', origin: 'CESS', department: 'BSEd English, 3rd Year', position: 'Student' },
  { idNumber: 'EMP-2019-011', name: 'Prof. Ana Lim', email: 'faculty@msunaawan.edu.ph', role: 'faculty', origin: 'CESS', department: 'Department of Secondary and Elementary Education', position: 'Assistant Professor' },
  { idNumber: 'CHR-2026-01', name: 'Dr. Liza Fernandez', email: 'chairperson@msunaawan.edu.ph', role: 'chairperson', origin: 'CESS', department: 'Department of Secondary and Elementary Education', position: 'Department Chairperson' },
  { idNumber: 'DEAN-2026-01', name: 'Dr. Ramon Villanueva', email: 'dean@msunaawan.edu.ph', role: 'dean', origin: 'CESS', department: 'College of Education and Social Sciences', position: 'College Dean' },
  { idNumber: 'SEC-2026-01', name: 'Ms. Carmela Ortiz', email: 'secretary@msunaawan.edu.ph', role: 'secretary', origin: 'CESS', department: 'College of Education and Social Sciences', position: 'College Secretary' },
];

async function seedAccounts() {
  for (const acc of ACCOUNTS) {
    const { primary } = getPasswordsForRole(acc.role, acc.origin, acc.email);
    await provisionVerifiedUser({ ...acc, password: primary, accountStatus: 'Active', isWhitelisted: true });
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PB-40 TESTS: SYLLABUS TEMPLATES & DIRECTORY LISTINGS');
  console.log('================================================================\n');

  await seedAccounts();
  const facUser = await UserModel.findByEmail('faculty@msunaawan.edu.ph');
  assert.ok(facUser?.id);

  const server = app.listen(0);
  const baseUrl = `http://localhost:${server.address().port}/api`;

  const createdSyllabusIds = [];
  const createdAnnouncementIds = [];
  let createdFacultyId = null;
  let createdSubjectCode = null;

  const request = async (path, options = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const text = await res.text();
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      body = { rawText: text };
    }
    return { status: res.status, headers: res.headers, body };
  };

  const secHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
  const facHeaders = { 'x-user-email': 'faculty@msunaawan.edu.ph' };
  const stuHeaders = { 'x-user-email': 'student@msunaawan.edu.ph' };
  const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };

  try {
    // 1. Seed a faculty syllabus to guarantee existing syllabi remain untouched by template change
    console.log('1️⃣  Creating Faculty Syllabus & Testing Non-Overwrite Protection...');
    const uniqueCode = `PB40TEST${Date.now().toString().slice(-4)}`;
    const firstUpload = await request('/directory/syllabi', {
      method: 'POST',
      headers: facHeaders,
      body: JSON.stringify({
        subjectCode: uniqueCode,
        subjectName: 'PB-40 Sample Pedagogy Course',
        academicYear: '2026-2027',
        semester: '1st Semester',
        fileName: `${uniqueCode}_v1.pdf`,
        fileUrl: `/syllabi/${uniqueCode}_v1.pdf`,
      }),
    });
    assert.strictEqual(firstUpload.status, 201);
    const sylId = firstUpload.body.syllabus.id;
    createdSyllabusIds.push(sylId);

    // Explicit non-silent overwrite protection (`overwrite: false` -> 409 Conflict)
    const blockedOverwrite = await request('/directory/syllabi', {
      method: 'POST',
      headers: facHeaders,
      body: JSON.stringify({
        subjectCode: uniqueCode,
        academicYear: '2026-2027',
        semester: '1st Semester',
        fileName: `${uniqueCode}_accidental.pdf`,
        overwrite: false,
      }),
    });
    assert.strictEqual(blockedOverwrite.status, 409);

    // Explicit PUT update archives prior version cleanly
    const explicitUpdate = await request(`/directory/syllabi/${sylId}`, {
      method: 'PUT',
      headers: secHeaders,
      body: JSON.stringify({
        fileName: `${uniqueCode}_v2.pdf`,
        fileUrl: `/syllabi/${uniqueCode}_v2.pdf`,
        changeNotes: 'Secretary verified syllabus alignment.',
      }),
    });
    assert.strictEqual(explicitUpdate.status, 200);
    assert.strictEqual(explicitUpdate.body.syllabus.fileName, `${uniqueCode}_v2.pdf`);
    assert.ok(explicitUpdate.body.history.length >= 1, 'Expected prior syllabus version in traceable history');
    console.log('   ✅ Non-overwrite guard (409) & syllabus version history verified.\n');

    // 2. Non-Secretary blocked from template & listing management
    console.log('2️⃣  Testing RBAC Guard on Template & Approved Directory Listings...');
    assert.strictEqual((await request('/directory/template', { method: 'PUT' })).status, 401);
    for (const hdr of [facHeaders, stuHeaders, deanHeaders]) {
      assert.strictEqual(
        (await request('/directory/template', {
          method: 'PUT',
          headers: hdr,
          body: JSON.stringify({ fileName: 'HackTemplate.docx' }),
        })).status,
        403
      );
      assert.strictEqual(
        (await request('/directory/faculty', {
          method: 'POST',
          headers: hdr,
          body: JSON.stringify({ name: 'Unauthorized Prof' }),
        })).status,
        403
      );
      assert.strictEqual(
        (await request('/directory/subjects', {
          method: 'POST',
          headers: hdr,
          body: JSON.stringify({ subjectCode: 'HACK 101', subjectName: 'Unauthorized' }),
        })).status,
        403
      );
      assert.strictEqual((await request('/directory/audit-logs', { headers: hdr })).status, 403);
    }
    console.log('   ✅ Non-Secretary roles denied access to all template/listing management routes.\n');

    // 3. Secretary updates official syllabus template -> Auto-announcement + Future downloads + Untouched syllabi
    console.log('3️⃣  Testing Template Replacement, Future Downloads & PO Announcement...');
    const initialTemplate = (await request('/directory/template', { headers: facHeaders })).body.template;
    const initialVersion = initialTemplate.version || 1;

    const newFileName = 'CESS_Official_Syllabus_OBE_v2_2026.docx';
    const newFileUrl = '/templates/CESS_Official_Syllabus_OBE_v2_2026.docx';
    const updateTmplRes = await request('/directory/template', {
      method: 'PUT',
      headers: secHeaders,
      body: JSON.stringify({
        fileName: newFileName,
        fileUrl: newFileUrl,
        fileSize: '188 KB',
        academicTerm: '2026-2027 (2nd Semester)',
        changeNotes: 'Updated CHED OBE outcomes alignment.',
      }),
    });
    assert.strictEqual(updateTmplRes.status, 200);
    assert.strictEqual(updateTmplRes.body.template.version, initialVersion + 1);
    assert.strictEqual(updateTmplRes.body.template.fileName, newFileName);
    assert.strictEqual(updateTmplRes.body.existingSyllabiOverwritten, false);
    assert.ok(updateTmplRes.body.announcement?.announcement_id, 'PO Note requires announcement on template update!');
    createdAnnouncementIds.push(updateTmplRes.body.announcement.announcement_id);

    // Verify existing faculty syllabus was NOT overwritten by template replacement
    const checkExistingSyl = await request(`/directory/syllabi/${sylId}`, { headers: facHeaders });
    assert.strictEqual(checkExistingSyl.status, 200);
    assert.strictEqual(checkExistingSyl.body.syllabus.fileName, `${uniqueCode}_v2.pdf`);

    // Verify future downloads serve current updated template (JSON + attachment download mode)
    const downloadJson = await request('/directory/template/download', { headers: facHeaders });
    assert.strictEqual(downloadJson.status, 200);
    assert.strictEqual(downloadJson.body.fileName, newFileName);
    assert.strictEqual(downloadJson.body.version, initialVersion + 1);

    const downloadStream = await request('/directory/template/download?download=1', { headers: facHeaders });
    assert.strictEqual(downloadStream.status, 200);
    assert.ok(downloadStream.headers.get('content-disposition').includes(newFileName));
    assert.ok(downloadStream.body.rawText.includes(newFileName));

    // Verify published announcement appears in directory announcements
    const annListRes = await request('/directory/announcements?category=syllabus_template', { headers: facHeaders });
    assert.strictEqual(annListRes.status, 200);
    assert.ok(
      annListRes.body.announcements.some(
        (a) => String(a.announcement_id) === String(updateTmplRes.body.announcement.announcement_id)
      ),
      'Published template-change announcement not visible to faculty!'
    );

    // Verify traceable template history
    const histRes = await request('/directory/template/history', { headers: facHeaders });
    assert.strictEqual(histRes.status, 200);
    assert.strictEqual(histRes.body.currentVersion, initialVersion + 1);
    assert.ok(histRes.body.history.length >= 2);
    console.log('   ✅ Template updated, download resolves to latest version, announcement created, syllabi intact.\n');

    // 4. Secretary CRUD on approved Faculty & Subject directory listings + Audit logs
    console.log('4️⃣  Testing Secretary Approved Directory Listing Management & Audit Logs...');
    const facCreateRes = await request('/directory/faculty', {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({
        name: 'Dr. Elena PB40 Magno',
        email: 'elena.pb40@msunaawan.edu.ph',
        unit: 'CESS',
        department: 'Department of Secondary and Elementary Education',
        position: 'Associate Professor II',
      }),
    });
    assert.strictEqual(facCreateRes.status, 201);
    createdFacultyId = facCreateRes.body.faculty.id;

    const facUpdRes = await request(`/directory/faculty/${createdFacultyId}`, {
      method: 'PUT',
      headers: secHeaders,
      body: JSON.stringify({ position: 'Professor I' }),
    });
    assert.strictEqual(facUpdRes.status, 200);
    assert.strictEqual(facUpdRes.body.faculty.position, 'Professor I');

    createdSubjectCode = `EDUC${Date.now().toString().slice(-4)}`;
    const subjCreateRes = await request('/directory/subjects', {
      method: 'POST',
      headers: secHeaders,
      body: JSON.stringify({
        subjectCode: createdSubjectCode,
        subjectName: 'PB-40 Curriculum Design',
        unit: 'CESS',
        assignedFacultyId: createdFacultyId,
      }),
    });
    assert.strictEqual(subjCreateRes.status, 201);

    const subjBrowseRes = await request(`/directory/subjects?search=${createdSubjectCode}`, { headers: stuHeaders });
    assert.strictEqual(subjBrowseRes.status, 200);
    assert.ok(subjBrowseRes.body.subjects.some((s) => s.code === createdSubjectCode));

    const subjUpdRes = await request(`/directory/subjects/${createdSubjectCode}`, {
      method: 'PUT',
      headers: secHeaders,
      body: JSON.stringify({ subjectName: 'PB-40 Curriculum Design (Approved Revision)' }),
    });
    assert.strictEqual(subjUpdRes.status, 200);
    assert.strictEqual(subjUpdRes.body.subject.title, 'PB-40 Curriculum Design (Approved Revision)');

    const subjDelRes = await request(`/directory/subjects/${createdSubjectCode}`, { method: 'DELETE', headers: secHeaders });
    assert.strictEqual(subjDelRes.status, 200);
    createdSubjectCode = null;

    const facDelRes = await request(`/directory/faculty/${createdFacultyId}`, { method: 'DELETE', headers: secHeaders });
    assert.strictEqual(facDelRes.status, 200);
    createdFacultyId = null;

    const auditLogsRes = await request('/directory/audit-logs', { headers: secHeaders });
    assert.strictEqual(auditLogsRes.status, 200);
    const actions = new Set(auditLogsRes.body.logs.map((l) => l.action));
    assert.ok(actions.has('TEMPLATE_REPLACED'));
    assert.ok(actions.has('FACULTY_LISTING_CREATED'));
    assert.ok(actions.has('FACULTY_LISTING_UPDATED'));
    assert.ok(actions.has('SUBJECT_LISTING_CREATED'));
    console.log('   ✅ Approved faculty/subject listings CRUD & full audit traceability verified.\n');

    console.log('================================================================');
    console.log('🎉 ALL PB-40 TESTS PASSED!');
    console.log('================================================================');
  } finally {
    if (createdFacultyId) {
      await DirectoryModel.deleteFacultyListing(createdFacultyId).catch(() => null);
    }
    if (createdSubjectCode) {
      await DirectoryModel.deleteSubjectListing(createdSubjectCode).catch(() => null);
    }
    await DirectoryModel.cleanupTestRecords({
      syllabusIds: createdSyllabusIds,
      announcementIds: createdAnnouncementIds,
    }).catch(() => null);
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ PB-40 TEST FAILED:', err);
  process.exit(1);
});

