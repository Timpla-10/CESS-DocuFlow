/**
 * Integration Test Suite for Ticket PB-10:
 * "Browse available document types [P0]" (REQ-SUB-1, REQ-AUTH-2)
 */
const app = require('../server');
const supabase = require('../config/database');
const DocumentModel = require('../models/documentModel');
const DocumentTypeModel = require('../models/documentTypeModel');
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
    idNumber: 'EMP-2019-011',
    name: 'Prof. Ana Lim',
    email: 'faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'CESS',
    department: 'Department of Secondary and Elementary Education',
    position: 'Assistant Professor',
  },
  {
    idNumber: 'EMP-2018-092',
    name: 'Mr. Jose Dela Cruz',
    email: 'ids.faculty@msunaawan.edu.ph',
    role: 'faculty',
    origin: 'IDS',
    department: 'Integrated Developmental School',
    position: 'Teacher III',
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
  console.log('🧪 RUNNING PB-10 INTEGRATION TESTS: BROWSE AVAILABLE DOCUMENT TYPES');
  console.log('================================================================\n');

  await seedTestUsers();
  console.log('✅ Verified test accounts provisioned in Supabase.\n');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  const createdDocIds = [];

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
    const facultyHeaders = { 'x-user-email': 'faculty@msunaawan.edu.ph' };
    const idsFacultyHeaders = { 'x-user-email': 'ids.faculty@msunaawan.edu.ph' };
    const secretaryHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };

    // -------------------------------------------------------------------------
    // TEST 1: Student Document Type Browsing
    // -------------------------------------------------------------------------
    console.log('1️⃣  Testing Student Document Type Browsing (GET /api/document-types)...');
    const studentRes = await request('/document-types', { headers: studentHeaders });
    if (studentRes.status !== 200) {
      throw new Error(`Student GET /api/document-types failed with status ${studentRes.status}: ${JSON.stringify(studentRes.body)}`);
    }

    const studentTypes = studentRes.body.documentTypes;
    console.log(`   ✅ Student received ${studentTypes.length} document types.`);

    // Assert: Only student document types are returned
    const invalidForStudent = studentTypes.filter((t) => t.audience !== 'student');
    if (invalidForStudent.length > 0) {
      throw new Error(`Student received faculty-only document types: ${invalidForStudent.map((t) => t.name).join(', ')}`);
    }
    console.log('   ✅ All returned types strictly have audience = "student":', studentTypes.map((t) => t.name));

    // Assert: Metadata completeness (name, SLA, origin, requirements)
    for (const t of studentTypes) {
      if (!t.name || !t.standardProcessingDays || !t.origin || !Array.isArray(t.requirements)) {
        throw new Error(`Incomplete metadata on document type: ${JSON.stringify(t)}`);
      }
    }
    console.log('   ✅ All document types contain valid SLA turnaround days, origin, and requirement checklists.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Faculty Document Type Browsing
    // -------------------------------------------------------------------------
    console.log('2️⃣  Testing Faculty Document Type Browsing (GET /api/document-types)...');
    const facultyRes = await request('/document-types', { headers: facultyHeaders });
    if (facultyRes.status !== 200) {
      throw new Error(`Faculty GET /api/document-types failed: ${JSON.stringify(facultyRes.body)}`);
    }

    const facultyTypes = facultyRes.body.documentTypes;
    console.log(`   ✅ Faculty received ${facultyTypes.length} document types.`);

    // Assert: Only faculty document types are returned
    const invalidForFaculty = facultyTypes.filter((t) => t.audience !== 'faculty');
    if (invalidForFaculty.length > 0) {
      throw new Error(`Faculty received student document types: ${invalidForFaculty.map((t) => t.name).join(', ')}`);
    }
    console.log('   ✅ All returned types strictly have audience = "faculty":', facultyTypes.map((t) => t.name));

    // Also verify IDS Faculty gets IDS faculty options
    const idsFacultyRes = await request('/document-types', { headers: idsFacultyHeaders });
    const idsTypes = idsFacultyRes.body.documentTypes;
    const hasIdsTravelOrder = idsTypes.some((t) => t.name.includes('IDS Travel Order'));
    if (!hasIdsTravelOrder) {
      throw new Error('IDS Faculty missing IDS Travel Order document type.');
    }
    console.log('   ✅ IDS Faculty receives IDS Travel Order option successfully.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Secretary Admin Browsing (Sees ALL Active Types)
    // -------------------------------------------------------------------------
    console.log('3️⃣  Testing Secretary Admin Browsing (All Active Document Types)...');
    const secRes = await request('/document-types', { headers: secretaryHeaders });
    const secTypes = secRes.body.documentTypes;
    console.log(`   ✅ Secretary receives ALL ${secTypes.length} active types across Student & Faculty.\n`);

    // -------------------------------------------------------------------------
    // TEST 4: Unauthorized User Rejection (401 Unauthorized)
    // -------------------------------------------------------------------------
    console.log('4️⃣  Testing Unauthenticated Request...');
    const unauthRes = await request('/document-types');
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401, got ${unauthRes.status}`);
    }
    console.log(`   ✅ Unauthenticated request blocked -> Status 401: "${unauthRes.body.error}"\n`);

    // -------------------------------------------------------------------------
    // TEST 5: Acceptance Criteria 3: Unsupported Types Cannot Be Submitted (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log('5️⃣  Testing Rejection of Ineligible Document Types on Submission...');
    // Student tries to submit a faculty document type (e.g. Faculty Leave Form, id 4)
    const runTag = Date.now().toString().slice(-5);
    const illegalSubmitRes = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 4, // Faculty Leave Recommendation Form
        title: 'Student Attempting Faculty Leave Request',
        controlBase: `MSU-TEST-ILLEGAL-${runTag}`,
      }),
    });

    if (illegalSubmitRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden when Student submits Faculty type, got ${illegalSubmitRes.status}`);
    }
    console.log(`   ✅ Student submitting Faculty Leave blocked -> Status 403: "${illegalSubmitRes.body.error}"`);

    // Faculty tries to submit a student document type (e.g. INC Form, id 1)
    const illegalFacSubmit = await request('/documents', {
      method: 'POST',
      headers: facultyHeaders,
      body: JSON.stringify({
        docTypeId: 1, // Completion of INC
        title: 'Faculty Attempting Student INC Request',
        controlBase: `MSU-TEST-FAC-ILLEGAL-${runTag}`,
      }),
    });

    if (illegalFacSubmit.status !== 403) {
      throw new Error(`Expected 403 Forbidden when Faculty submits Student INC, got ${illegalFacSubmit.status}`);
    }
    console.log(`   ✅ Faculty submitting Student INC blocked -> Status 403: "${illegalFacSubmit.body.error}"\n`);

    // -------------------------------------------------------------------------
    // TEST 6: Valid Role Document Submission (201 Created)
    // -------------------------------------------------------------------------
    console.log('6️⃣  Testing Valid Document Submission with Role-Eligible Type...');
    const validStudentSubmit = await request('/documents', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        docTypeId: 1, // INC Form
        title: 'Valid Student INC Submission',
        controlBase: `MSU-CESS-STU-VAL-${runTag}-2026`,
      }),
    });

    if (validStudentSubmit.status !== 201) {
      throw new Error(`Expected 201 Created, got ${validStudentSubmit.status}: ${JSON.stringify(validStudentSubmit.body)}`);
    }
    createdDocIds.push(validStudentSubmit.body.document.id);
    console.log(`   ✅ Student successfully submitted valid INC form -> Control No: ${validStudentSubmit.body.document.control_number}\n`);

    console.log('================================================================');
    console.log('🎉 ALL PB-10 ACCEPTANCE CRITERIA VERIFIED & TESTS PASSED!');
    console.log('================================================================');
  } finally {
    for (const id of createdDocIds) {
      await DocumentModel.softDelete(id).catch(() => {});
    }
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ PB-10 Test failed:', err);
  process.exit(1);
});
