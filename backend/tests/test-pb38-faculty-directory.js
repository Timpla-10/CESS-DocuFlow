/**
 * Integration Test Suite for Ticket PB-38:
 * "Faculty, subjects, and syllabus directory [P1]"
 *
 * User Story:
 *   As a student or authorized user, I want to browse faculty, subjects they handle, and available syllabi.
 *
 * Acceptance Criteria:
 *   1. Directory shows faculty and assigned subjects (plus search/detail browsing)
 *   2. CESS/IDS are distinguished (`unit` / `origin` separation, counts, and `?unit=` filtering)
 *   3. Syllabus visibility & management follow approved permissions:
 *      - 401 when unauthenticated
 *      - Secretary sees CESS & IDS and can update official syllabus template
 *      - CESS Dean is scoped to CESS collegiate units only (403 on IDS)
 *      - IDS Principal is scoped to IDS department only (403 on CESS)
 *      - Students see faculty & subjects within their unit and syllabi for eligible/enrolled subjects only (403 on cross-unit/out-of-program)
 *      - Faculty can view, upload/replace, and delete own syllabi while peers' syllabi remain privacy-protected (403)
 */

const assert = require('assert');
const http = require('http');
const app = require('../server');
const DirectoryModel = require('../models/directoryModel');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser } = require('../services/authService');

const TEST_USERS = [
  {
    idNumber: 'STU-PB38-CESS',
    name: 'Maria English PB38',
    email: 'student.cess.pb38@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English, 3rd Year',
    position: 'Student',
  },
  {
    idNumber: 'STU-PB38-IDS',
    name: 'Danica IDS PB38',
    email: 'student.ids.pb38@msunaawan.edu.ph',
    role: 'student',
    origin: 'IDS',
    department: 'Integrated Developmental School - Grade 12 STEM',
    position: 'Student',
  },
  {
    idNumber: 'FAC-PB38-A',
    name: 'Prof. Elena CESS A PB38',
    email: 'faculty.a.pb38@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Assistant Professor',
  },
  {
    idNumber: 'FAC-PB38-B',
    name: 'Prof. Marco CESS B PB38',
    email: 'faculty.b.pb38@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Social Sciences and Humanities',
    position: 'Instructor',
  },
  {
    idNumber: 'FAC-PB38-IDS',
    name: 'Mr. Noel IDS PB38',
    email: 'faculty.ids.pb38@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'Teacher III',
  },
  {
    idNumber: 'SEC-PB38-01',
    name: 'Sec. Carmela PB38',
    email: 'secretary.pb38@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
  },
  {
    idNumber: 'DEAN-PB38-01',
    name: 'Dr. Ramon Dean PB38',
    email: 'dean.pb38@msunaawan.edu.ph',
    role: 'dean',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Dean',
  },
  {
    idNumber: 'PRI-PB38-01',
    name: 'Dr. Teresa Principal PB38',
    email: 'principal.pb38@msunaawan.edu.ph',
    role: 'ids_principal',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'IDS Principal',
  },
];

async function ensureUsers() {
  const byEmail = {};
  for (const u of TEST_USERS) {
    let existing = await UserModel.findByEmail(u.email);
    if (!existing) {
      await provisionVerifiedUser({
        idNumber: u.idNumber,
        name: u.name,
        email: u.email,
        role: u.role,
        origin: u.origin,
        department: u.department,
        position: u.position,
      });
      existing = await UserModel.findByEmail(u.email);
    }
    byEmail[u.email] = existing;
  }
  return byEmail;
}

function createRequester(baseUrl) {
  return function request(method, path, { email = null, body = null } = {}) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (email) headers['x-user-email'] = email;
      const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (body !== null) req.write(JSON.stringify(body));
      req.end();
    });
  };
}

async function runTests() {
  console.log('\n🧪 Starting PB-38 Faculty, Subjects, and Syllabus Directory Tests...\n');
  let server = null;
  const createdSyllabusIds = [];
  const createdSubjectIds = [];
  const createdProfileIds = [];

  try {
    const users = await ensureUsers();
    const studentCess = users['student.cess.pb38@msunaawan.edu.ph'];
    const studentIds = users['student.ids.pb38@msunaawan.edu.ph'];
    const facultyA = users['faculty.a.pb38@msunaawan.edu.ph'];
    const facultyB = users['faculty.b.pb38@msunaawan.edu.ph'];
    const secretary = users['secretary.pb38@msunaawan.edu.ph'];
    const dean = users['dean.pb38@msunaawan.edu.ph'];
    const principal = users['principal.pb38@msunaawan.edu.ph'];

    server = app.listen(0);
    const { port } = server.address();
    const request = createRequester(`http://127.0.0.1:${port}`);

    // =========================================================================
    // TEST 1: Authentication guard (401)
    // =========================================================================
    console.log('▶ Test 1: Unauthenticated access blocked (401)...');
    assert.strictEqual((await request('GET', '/api/directory')).status, 401);
    assert.strictEqual((await request('GET', '/api/directory/subjects')).status, 401);
    assert.strictEqual((await request('GET', '/api/directory/syllabi')).status, 401);
    assert.strictEqual((await request('GET', '/api/directory/template')).status, 401);
    console.log('  ✅ Unauthenticated requests return 401.');

    // =========================================================================
    // TEST 2: AC1 & AC2 — Directory shows faculty, subjects, and CESS vs IDS distinction
    // =========================================================================
    console.log('▶ Test 2: Directory displays faculty, assigned subjects & distinguishes CESS vs IDS...');
    const secDir = await request('GET', '/api/directory', { email: secretary.email });
    assert.strictEqual(secDir.status, 200);
    assert(secDir.body.counts.CESS >= 4, 'Secretary must see CESS faculty entries');
    assert(secDir.body.counts.IDS >= 1, 'Secretary must see IDS faculty entries');
    assert(Array.isArray(secDir.body.units.CESS) && Array.isArray(secDir.body.units.IDS), 'Directory must separate CESS and IDS groups');
    assert(secDir.body.units.CESS.every((f) => f.unit === 'CESS' && f.origin === 'CESS'));
    assert(secDir.body.units.IDS.every((f) => f.unit === 'IDS' && f.origin === 'IDS'));

    // Filter strictly by unit
    const onlyIds = await request('GET', '/api/directory?unit=IDS', { email: secretary.email });
    assert.strictEqual(onlyIds.status, 200);
    assert(onlyIds.body.faculty.length >= 1);
    assert(onlyIds.body.faculty.every((f) => f.unit === 'IDS'), 'unit=IDS must return only IDS faculty');

    const onlyCess = await request('GET', '/api/directory?unit=CESS', { email: secretary.email });
    assert.strictEqual(onlyCess.status, 200);
    assert(onlyCess.body.faculty.every((f) => f.unit === 'CESS'), 'unit=CESS must return only CESS faculty');

    // Search by subject code & view subjects list
    const searchEduc = await request('GET', '/api/directory?search=EDUC%20101', { email: secretary.email });
    assert.strictEqual(searchEduc.status, 200);
    assert(searchEduc.body.faculty.some((f) => f.subjects.some((s) => s.code === 'EDUC 101')));

    const subjectsRes = await request('GET', '/api/directory/subjects', { email: secretary.email });
    assert.strictEqual(subjectsRes.status, 200);
    assert(subjectsRes.body.counts.CESS >= 1 && subjectsRes.body.counts.IDS >= 1);
    assert(subjectsRes.body.units.CESS.some((s) => s.code === 'EDUC 101' && s.assignedFaculty.length > 0));
    assert(subjectsRes.body.units.IDS.some((s) => s.code === 'SCI 10' && s.assignedFaculty.length > 0));
    console.log('  ✅ Faculty, assigned subjects, and CESS/IDS distinction verified.');

    // =========================================================================
    // TEST 3: AC3 — Role-scoped CESS Dean vs IDS Principal visibility
    // =========================================================================
    console.log('▶ Test 3: Enforcing CESS Dean vs IDS Principal unit scoping...');
    const deanDir = await request('GET', '/api/directory', { email: dean.email });
    assert.strictEqual(deanDir.status, 200);
    assert.deepStrictEqual(deanDir.body.allowedUnits, ['CESS']);
    assert.strictEqual(deanDir.body.counts.IDS, 0, 'CESS Dean must not receive IDS entries');
    assert.strictEqual((await request('GET', '/api/directory?unit=IDS', { email: dean.email })).status, 403);
    assert.strictEqual((await request('GET', '/api/directory/faculty/fac-5', { email: dean.email })).status, 403);
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-sci-10', { email: dean.email })).status, 403);
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-educ-101', { email: dean.email })).status, 200);

    const prinDir = await request('GET', '/api/directory', { email: principal.email });
    assert.strictEqual(prinDir.status, 200);
    assert.deepStrictEqual(prinDir.body.allowedUnits, ['IDS']);
    assert.strictEqual(prinDir.body.counts.CESS, 0, 'IDS Principal must not receive CESS entries');
    assert.strictEqual((await request('GET', '/api/directory?unit=CESS', { email: principal.email })).status, 403);
    assert.strictEqual((await request('GET', '/api/directory/faculty/fac-1', { email: principal.email })).status, 403);
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-educ-101', { email: principal.email })).status, 403);
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-sci-10', { email: principal.email })).status, 200);
    console.log('  ✅ Dean (CESS-only) and IDS Principal (IDS-only) boundaries enforced.');

    // =========================================================================
    // TEST 4: AC3 — Student unit & eligible-subject syllabus visibility
    // =========================================================================
    console.log('▶ Test 4: Enforcing Student unit & eligible-subject syllabus visibility...');
    const cStuDir = await request('GET', '/api/directory', { email: studentCess.email });
    assert.strictEqual(cStuDir.status, 200);
    assert.strictEqual(cStuDir.body.counts.IDS, 0, 'CESS student must see CESS unit only');
    assert.strictEqual((await request('GET', '/api/directory?unit=IDS', { email: studentCess.email })).status, 403);

    // Eligible DSEE/English syllabi allowed
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-educ-101', { email: studentCess.email })).status, 200);
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-eng-102', { email: studentCess.email })).status, 200);
    // Out-of-program SOCSCI syllabus and cross-unit IDS syllabus denied
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-socsci-220', { email: studentCess.email })).status, 403);
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-sci-10', { email: studentCess.email })).status, 403);

    // Check SOCSCI 220 appears in CESS directory for student, but syllabus URL is stripped/hidden
    const benCard = cStuDir.body.faculty.find((f) => f.id === 'fac-2');
    assert(benCard, 'CESS student can browse CESS faculty listing');
    const soc220 = benCard.subjects.find((s) => s.code === 'SOCSCI 220');
    assert.strictEqual(soc220.syllabusAvailable, true);
    assert.strictEqual(soc220.canViewSyllabus, false);
    assert.strictEqual(soc220.syllabusHidden, true);
    assert.strictEqual(soc220.syllabus, null, 'Restricted syllabus details must be redacted from payload');

    // IDS Student scoped to IDS only
    const iStuDir = await request('GET', '/api/directory', { email: studentIds.email });
    assert.strictEqual(iStuDir.status, 200);
    assert.strictEqual(iStuDir.body.counts.CESS, 0);
    assert(iStuDir.body.counts.IDS >= 1);
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-sci-10', { email: studentIds.email })).status, 200);
    assert.strictEqual((await request('GET', '/api/directory/syllabi/syl-educ-101', { email: studentIds.email })).status, 403);
    assert.strictEqual((await request('GET', '/api/directory?unit=CESS', { email: studentIds.email })).status, 403);

    // Student cannot upload or modify template
    assert.strictEqual(
      (await request('POST', '/api/directory/syllabi', {
        email: studentCess.email,
        body: { subjectCode: 'EDUC 999', fileName: 'hack.pdf' },
      })).status,
      403
    );
    assert.strictEqual(
      (await request('PUT', '/api/directory/template', {
        email: studentCess.email,
        body: { fileName: 'Fake.docx' },
      })).status,
      403
    );
    console.log('  ✅ Student unit, program eligibility, and write protections verified.');

    // =========================================================================
    // TEST 5: AC3 — Faculty self-service (Supabase persistence) & peer privacy
    // =========================================================================
    console.log('▶ Test 5: Verifying Faculty own-syllabus management & peer syllabus privacy...');
    const uploadRes = await request('POST', '/api/directory/syllabi', {
      email: facultyA.email,
      body: {
        subjectCode: 'PB38-ED-101',
        subjectName: 'PB38 Educational Technology',
        description: 'Temporary integration test subject for PB-38',
        academicYear: '2026-2027',
        semester: '1st Semester',
        fileName: 'PB38_ED101_Syllabus_v1.pdf',
      },
    });
    assert.strictEqual(uploadRes.status, 201);
    const sylId = uploadRes.body.syllabus.id;
    createdSyllabusIds.push(sylId);
    if (uploadRes.body.syllabus.subjectId) createdSubjectIds.push(uploadRes.body.syllabus.subjectId);
    if (uploadRes.body.syllabus.facultyProfileId) createdProfileIds.push(uploadRes.body.syllabus.facultyProfileId);

    // Faculty A can view own uploaded syllabus
    const ownDetail = await request('GET', `/api/directory/syllabi/${sylId}`, { email: facultyA.email });
    assert.strictEqual(ownDetail.status, 200);
    assert.strictEqual(ownDetail.body.syllabus.fileName, 'PB38_ED101_Syllabus_v1.pdf');

    // Replace own syllabus
    const replaceRes = await request('POST', '/api/directory/syllabi', {
      email: facultyA.email,
      body: {
        subjectCode: 'PB38-ED-101',
        subjectName: 'PB38 Educational Technology',
        academicYear: '2026-2027',
        semester: '1st Semester',
        fileName: 'PB38_ED101_Syllabus_v2.pdf',
      },
    });
    assert.strictEqual(replaceRes.status, 201);
    assert.strictEqual(replaceRes.body.syllabus.id, sylId, 'Upsert on same term updates existing syllabus row');
    assert.strictEqual(replaceRes.body.syllabus.fileName, 'PB38_ED101_Syllabus_v2.pdf');

    // Peer Faculty B sees Faculty A subject in directory, but syllabus is redacted, and direct fetch/delete/upload for A are 403
    const facBDir = await request('GET', '/api/directory', { email: facultyB.email });
    assert.strictEqual(facBDir.status, 200);
    const facACardForB = facBDir.body.faculty.find((f) => f.userId === facultyA.id);
    assert(facACardForB, 'Faculty B sees Faculty A in directory');
    const pb38SubjForB = facACardForB.subjects.find((s) => s.code === 'PB38-ED-101');
    assert.strictEqual(pb38SubjForB.canViewSyllabus, false);
    assert.strictEqual(pb38SubjForB.syllabusHidden, true);
    assert.strictEqual(pb38SubjForB.syllabus, null);

    assert.strictEqual((await request('GET', `/api/directory/syllabi/${sylId}`, { email: facultyB.email })).status, 403);
    assert.strictEqual(
      (await request('POST', '/api/directory/syllabi', {
        email: facultyB.email,
        body: { facultyId: facACardForB.profileId, subjectCode: 'PB38-ED-101', fileName: 'tamper.pdf' },
      })).status,
      403
    );
    assert.strictEqual((await request('DELETE', `/api/directory/syllabi/${sylId}`, { email: facultyB.email })).status, 403);

    // Secretary CAN view Faculty A's syllabus & update official template
    assert.strictEqual((await request('GET', `/api/directory/syllabi/${sylId}`, { email: secretary.email })).status, 200);
    const originalTemplate = (await request('GET', '/api/directory/template', { email: secretary.email })).body.template;
    const updTemplateRes = await request('PUT', '/api/directory/template', {
      email: secretary.email,
      body: { fileName: 'CESS_Official_Syllabus_Template_v2.docx', fileSize: '150 KB' },
    });
    assert.strictEqual(updTemplateRes.status, 200);
    assert.strictEqual(updTemplateRes.body.template.fileName, 'CESS_Official_Syllabus_Template_v2.docx');
    // Restore original template metadata
    await request('PUT', '/api/directory/template', {
      email: secretary.email,
      body: { fileName: originalTemplate.fileName, fileSize: originalTemplate.fileSize },
    });

    // Non-secretary template update forbidden
    assert.strictEqual(
      (await request('PUT', '/api/directory/template', {
        email: facultyA.email,
        body: { fileName: 'Unauthorized.docx' },
      })).status,
      403
    );

    // Faculty A deletes own syllabus
    const delRes = await request('DELETE', `/api/directory/syllabi/${sylId}`, { email: facultyA.email });
    assert.strictEqual(delRes.status, 200);
    assert.strictEqual((await request('GET', `/api/directory/syllabi/${sylId}`, { email: secretary.email })).status, 404);
    console.log('  ✅ Faculty self-service DB persistence, peer privacy, and Secretary overrides verified.');

    console.log('\n🎉 ALL PB-38 FACULTY, SUBJECTS, AND SYLLABUS DIRECTORY TESTS PASSED!\n');
  } finally {
    console.log('🧹 Cleaning up temporary PB-38 test records...');
    await DirectoryModel.cleanupTestRecords({
      syllabusIds: createdSyllabusIds,
      subjectIds: createdSubjectIds,
      profileIds: createdProfileIds,
    }).catch(() => {});
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PB-38 TEST SUITE FAILED:', err);
    process.exit(1);
  });

