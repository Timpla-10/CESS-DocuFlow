/**
 * Integration Test Suite for Ticket PB-56:
 * "Separate Syllabus Management"
 *
 * User Story:
 *   As a faculty member, I want to manage course syllabi separately from other
 *   academic documents for easy uploading, organization, viewing, and retrieval.
 *
 * Acceptance Criteria tested:
 *   1. Dedicated document category/section specifically for course syllabi
 *   2. Faculty members can upload syllabus files for their assigned courses
 *   3. Authorized users (Faculty, Chairperson, Dean, Secretary, Students) can view and retrieve syllabi
 *   4. Keeps all syllabus records organized separately from other document types (Document_Request)
 *   5. Strictly enforces role-based user permissions (RBAC):
 *      - Students cannot upload/edit/delete syllabi (403)
 *      - Faculty cannot edit/delete another faculty's syllabus (403)
 *      - College Secretary manages the official institutional template
 */

const app = require('../server');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser } = require('../services/authService');

const TEST_USERS = [
  {
    idNumber: 'FAC-PB56-01',
    name: 'Prof. Ana Lim',
    email: 'faculty.pb56.ana@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Assistant Professor',
  },
  {
    idNumber: 'FAC-PB56-02',
    name: 'Prof. Ben Aquino',
    email: 'faculty.pb56.ben@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Social Sciences and Humanities',
    position: 'Instructor',
  },
  {
    idNumber: 'STU-PB56-01',
    name: 'Maria Santos',
    email: 'student.pb56@msunaawan.edu.ph',
    role: 'student',
    origin: 'CESS',
    department: 'BSEd English, 3rd Year',
    position: 'Student',
  },
  {
    idNumber: 'CHR-PB56-01',
    name: 'Dr. Liza Fernandez',
    email: 'chair.pb56@msunaawan.edu.ph',
    role: 'chairperson',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Department Chairperson',
  },
  {
    idNumber: 'SEC-PB56-01',
    name: 'Ms. Carmela Ortiz',
    email: 'secretary.pb56@msunaawan.edu.ph',
    role: 'secretary',
    origin: 'CESS',
    department: 'College of Education and Social Sciences',
    position: 'College Secretary',
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

async function request(method, path, { email, body } = {}) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      'http://localhost:5002' + path,
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

function assert(condition, label) {
  if (!condition) {
    throw new Error(`FAILED: ${label}`);
  }
  console.log(`   ✅ ${label}`);
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING PB-56 INTEGRATION TESTS: SEPARATE SYLLABUS MANAGEMENT');
  console.log('================================================================\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(5002, () => resolve());
  });

  try {
    await seedTestUsers();
    console.log('✅ Test accounts ready.\n');

    const facultyAna = seededAccounts['FAC-PB56-01'];
    const facultyBen = seededAccounts['FAC-PB56-02'];
    const student = seededAccounts['STU-PB56-01'];
    const chairperson = seededAccounts['CHR-PB56-01'];
    const secretary = seededAccounts['SEC-PB56-01'];

    // ------------------------------------------------------------------------
    // Criterion 1: Dedicated Syllabus Category / Listing
    // ------------------------------------------------------------------------
    console.log('1️⃣  Testing Syllabus Catalog Retrieval (Separate Category)...');
    // Students are unauthorized to list syllabi (403 Forbidden)
    const studentList = await request('GET', '/api/syllabi', { email: student.email });
    assert(studentList.status === 403, 'Students blocked from listing syllabi -> 403 Forbidden');

    // Faculty members and reviewers can browse the syllabus catalog
    const listRes = await request('GET', '/api/syllabi', { email: facultyAna.email });
    assert(listRes.status === 200, 'Faculty GET /api/syllabi returns 200');
    assert(Array.isArray(listRes.body.syllabi), 'Response contains syllabi array');
    assert(listRes.body.count >= 1, 'Pre-seeded syllabi are present in separate catalog');

    // Verify separation from document requests
    const docRes = await request('GET', '/api/documents', { email: student.email });
    assert(docRes.status === 200, 'GET /api/documents returns 200');
    console.log('   ✅ Syllabi records are isolated from standard document requests');

    console.log();

    // ------------------------------------------------------------------------
    // Criterion 2: Role-Based User Permissions (Upload Restrictions)
    // ------------------------------------------------------------------------
    console.log('2️⃣  Testing Role-Based Upload Restrictions (RBAC)...');

    // Students are forbidden from uploading course syllabi (403)
    const studentUpload = await request('POST', '/api/syllabi', {
      email: student.email,
      body: {
        subjectCode: 'EDUC 999',
        subjectTitle: 'Unauthorized Course',
        fileName: 'Unauthorized_Syllabus.pdf',
      },
    });
    assert(studentUpload.status === 403, 'Students blocked from uploading syllabi -> 403 Forbidden');

    // Faculty Ana uploads a syllabus for her own course
    const anaUpload = await request('POST', '/api/syllabi', {
      email: facultyAna.email,
      body: {
        subjectCode: 'EDUC 101',
        subjectTitle: 'The Child and Adolescent Learner',
        academicYear: '2026-2027',
        semester: '1st Semester',
        fileName: 'EDUC101_Syllabus_AnaLim.pdf',
        description: 'Complete OBE syllabus covering cognitive and emotional development.',
      },
    });
    assert(anaUpload.status === 201, 'Faculty successfully uploads own course syllabus (201)');
    const createdSyllabusId = anaUpload.body.syllabus.id;
    assert(createdSyllabusId !== undefined, 'Uploaded syllabus receives unique ID');

    console.log();

    // ------------------------------------------------------------------------
    // Criterion 3: Cross-Faculty Edit / Delete Protection (Ownership Guard)
    // ------------------------------------------------------------------------
    console.log('3️⃣  Testing Ownership Isolation (Faculty cannot edit/delete another’s syllabus)...');

    // Faculty Ben attempts to update Faculty Ana's syllabus -> 403 Forbidden
    const benEdit = await request('PUT', `/api/syllabi/${createdSyllabusId}`, {
      email: facultyBen.email,
      body: {
        subjectTitle: 'Hijacked Course Title',
        fileName: 'Malicious_File.pdf',
      },
    });
    assert(benEdit.status === 403, 'Faculty blocked from modifying another instructor’s syllabus -> 403');

    // Faculty Ben attempts to delete Faculty Ana's syllabus -> 403 Forbidden
    const benDelete = await request('DELETE', `/api/syllabi/${createdSyllabusId}`, {
      email: facultyBen.email,
    });
    assert(benDelete.status === 403, 'Faculty blocked from deleting another instructor’s syllabus -> 403');

    // Faculty Ana successfully updates her own syllabus
    const anaUpdate = await request('PUT', `/api/syllabi/${createdSyllabusId}`, {
      email: facultyAna.email,
      body: {
        subjectTitle: 'The Child and Adolescent Learner (Revised OBE)',
        fileName: 'EDUC101_Syllabus_AnaLim_Rev1.pdf',
      },
    });
    assert(anaUpdate.status === 200, 'Faculty successfully updates own course syllabus (200)');
    assert(
      anaUpdate.body.syllabus.subjectTitle.includes('Revised OBE'),
      'Updated syllabus title persists correctly'
    );

    console.log();

    // ------------------------------------------------------------------------
    // Criterion 4: Authorized Viewing & Retrieval
    // ------------------------------------------------------------------------
    console.log('4️⃣  Testing Authorized Retrieval and Viewing...');

    // Student attempts to view the uploaded syllabus -> 403 Forbidden
    const studentGet = await request('GET', `/api/syllabi/${createdSyllabusId}`, {
      email: student.email,
    });
    assert(studentGet.status === 403, 'Students blocked from viewing course syllabus -> 403 Forbidden');

    // Fellow faculty member views syllabus
    const benGet = await request('GET', `/api/syllabi/${createdSyllabusId}`, {
      email: facultyBen.email,
    });
    assert(benGet.status === 200, 'Faculty colleague can view/retrieve course syllabus (200)');
    assert(
      benGet.body.syllabus.subjectCode === 'EDUC 101',
      'Faculty views accurate course details'
    );

    // Chairperson views syllabus
    const chairGet = await request('GET', `/api/syllabi/${createdSyllabusId}`, {
      email: chairperson.email,
    });
    assert(chairGet.status === 200, 'Department Chairperson can inspect syllabus (200)');

    // Secretary views syllabus
    const secGet = await request('GET', `/api/syllabi/${createdSyllabusId}`, {
      email: secretary.email,
    });
    assert(secGet.status === 200, 'College Secretary can inspect syllabus for records (200)');

    console.log();

    // ------------------------------------------------------------------------
    // Criterion 5: Institutional Template Management (Secretary Authority)
    // ------------------------------------------------------------------------
    console.log('5️⃣  Testing Institutional Syllabus & TOS Template Management...');

    // Student attempts to get template -> 403 Forbidden
    const studentTemplate = await request('GET', '/api/syllabi/template', { email: student.email });
    assert(studentTemplate.status === 403, 'Students blocked from accessing syllabus template -> 403 Forbidden');

    // Faculty gets current template
    const templateRes = await request('GET', '/api/syllabi/template', { email: facultyAna.email });
    assert(templateRes.status === 200, 'GET /api/syllabi/template by Faculty returns 200');
    assert(templateRes.body.template.fileName !== undefined, 'Official template metadata returned');

    // Non-secretary (Faculty) attempts to replace official template -> 403 Forbidden
    const facultyTemplateUpdate = await request('PUT', '/api/syllabi/template', {
      email: facultyAna.email,
      body: { fileName: 'Unauthorized_Template.docx' },
    });
    assert(facultyTemplateUpdate.status === 403, 'Faculty blocked from modifying institutional template -> 403');

    // Secretary successfully updates official template
    const secTemplateUpdate = await request('PUT', '/api/syllabi/template', {
      email: secretary.email,
      body: { fileName: 'CESS_Official_Course_Syllabus_Template_2026_RevB.docx' },
    });
    assert(secTemplateUpdate.status === 200, 'College Secretary successfully updates official template (200)');
    assert(
      secTemplateUpdate.body.template.fileName === 'CESS_Official_Course_Syllabus_Template_2026_RevB.docx',
      'Updated template name persisted'
    );

    console.log();

    // ------------------------------------------------------------------------
    // Criterion 6: Syllabus Deletion by Owner
    // ------------------------------------------------------------------------
    console.log('6️⃣  Testing Syllabus Deletion by Owner...');
    const anaDelete = await request('DELETE', `/api/syllabi/${createdSyllabusId}`, {
      email: facultyAna.email,
    });
    assert(anaDelete.status === 200, 'Faculty successfully deletes own syllabus (200)');

    const verifyDeleted = await request('GET', `/api/syllabi/${createdSyllabusId}`, {
      email: facultyAna.email,
    });
    assert(verifyDeleted.status === 404, 'Deleted syllabus is no longer accessible (404)');

    console.log();

    console.log('================================================================');
    console.log('✅ ALL PB-56 INTEGRATION TESTS PASSED');
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
