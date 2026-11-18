/**
 * Integration Test Suite for Ticket PB-43:
 * "Manage users, roles, whitelist/masterlists [P0]"
 *
 * User Story:
 *   As the Secretary/System Admin, I want to verify accounts and maintain approved user/role lists.
 *
 * Acceptance Criteria:
 *   1. Authorized admin reviews account/role data
 *   2. Duplicate accounts prevented
 *   3. Changes restricted and traceable
 *   4. Unapproved users cannot gain privileged access
 */

const assert = require('assert');
const http = require('http');
const app = require('../server');
const supabase = require('../config/database');
const UserModel = require('../models/userModel');
const { provisionVerifiedUser } = require('../services/authService');

const runTag = Date.now();

function createRequester(baseUrl) {
  return function request(method, path, { email = null, token = null, body = null } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body !== null ? JSON.stringify(body) : null;
      const headers = { 'Content-Type': 'application/json' };
      if (email) headers['x-user-email'] = email;
      if (token) headers.Authorization = `Bearer ${token}`;
      if (payload !== null) headers['Content-Length'] = Buffer.byteLength(payload);
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
      if (payload !== null) req.write(payload);
      req.end();
    });
  };
}

async function deleteTestUserByEmail(email) {
  const user = await UserModel.findByEmail(email).catch(() => null);
  if (!user) return;
  await supabase.from('user_office').delete().eq('user_id', user.id);
  await supabase.from('user_role').delete().eq('user_id', user.id);
  await supabase.from('User').delete().eq('user_id', user.id);
  await supabase.auth.admin.deleteUser(user.id).catch(() => {});
}

async function runTests() {
  console.log('\n🧪 Starting PB-43 Manage Users, Roles, and Whitelist/Masterlist Tests...\n');
  let server = null;

  const tempEmails = [
    `pb43.created.${runTag}@msunaawan.edu.ph`,
    `pb43.wl.single.${runTag}@msunaawan.edu.ph`,
    `pb43.wl.batch1.${runTag}@msunaawan.edu.ph`,
    `pb43.wl.batch2.${runTag}@msunaawan.edu.ph`,
    `pb43.unapproved.sec.${runTag}@msunaawan.edu.ph`,
    `pb43.rejected.${runTag}@msunaawan.edu.ph`,
  ];

  try {
    // Ensure baseline admin & non-admin actors exist
    const secretary = await provisionVerifiedUser({
      email: 'secretary.pb43@msunaawan.edu.ph',
      name: 'Sec. Carmela PB43',
      role: 'secretary',
      origin: 'CESS',
      department: 'College of Education and Social Sciences',
    });
    const dean = await provisionVerifiedUser({
      email: 'dean.pb43@msunaawan.edu.ph',
      name: 'Dr. Ramon Dean PB43',
      role: 'dean',
      origin: 'CESS',
      department: 'College of Education and Social Sciences',
    });
    const student = await provisionVerifiedUser({
      email: 'student.pb43@msunaawan.edu.ph',
      name: 'Maria Student PB43',
      role: 'student',
      origin: 'CESS',
      department: 'BSEd English',
    });

    server = app.listen(0);
    const { port } = server.address();
    const request = createRequester(`http://127.0.0.1:${port}`);

    // =========================================================================
    // TEST 1: AC1 & AC3 — Restricted access & Admin reviews account/role data
    // =========================================================================
    console.log('▶ Test 1: Reviewing account/role data & enforcing admin-only access...');
    assert.strictEqual((await request('GET', '/api/auth/users')).status, 401);
    assert.strictEqual((await request('GET', '/api/auth/whitelist')).status, 401);
    assert.strictEqual((await request('GET', '/api/auth/pending')).status, 401);
    assert.strictEqual((await request('GET', '/api/auth/audit-logs')).status, 401);

    for (const nonAdmin of [student, dean]) {
      assert.strictEqual((await request('GET', '/api/auth/users', { email: nonAdmin.email })).status, 403);
      assert.strictEqual((await request('GET', '/api/auth/whitelist', { email: nonAdmin.email })).status, 403);
      assert.strictEqual((await request('GET', '/api/auth/pending', { email: nonAdmin.email })).status, 403);
      assert.strictEqual((await request('GET', '/api/auth/audit-logs', { email: nonAdmin.email })).status, 403);
      assert.strictEqual(
        (await request('POST', '/api/auth/users', {
          email: nonAdmin.email,
          body: { name: 'Hack', email: `hack.${runTag}@msunaawan.edu.ph`, role: 'secretary' },
        })).status,
        403
      );
    }

    const usersList = await request('GET', `/api/auth/users?role=dean&search=pb43`, { email: secretary.email });
    assert.strictEqual(usersList.status, 200);
    assert(usersList.body.users.some((u) => u.email === dean.email));

    const singleUser = await request('GET', `/api/auth/users/${dean.id}`, { email: secretary.email });
    assert.strictEqual(singleUser.status, 200);
    assert.strictEqual(singleUser.body.user.role, 'dean');
    assert.strictEqual(singleUser.body.user.is_whitelisted, true);
    console.log('  ✅ Admin review endpoints and non-admin restrictions (401/403) verified.');

    // =========================================================================
    // TEST 2: AC2 — Duplicate accounts prevented across creation, update, whitelist, registration
    // =========================================================================
    console.log('▶ Test 2: Preventing duplicate accounts & duplicate masterlist entries...');
    const createdEmail = tempEmails[0];
    const createRes = await request('POST', '/api/auth/users', {
      email: secretary.email,
      body: {
        name: 'Prof. New Faculty PB43',
        email: createdEmail,
        role: 'faculty',
        origin: 'CESS',
        department: 'Department of Secondary and Elementary Education',
      },
    });
    assert.strictEqual(createRes.status, 201);
    const createdUser = createRes.body.user;

    // Duplicate creation on POST /api/auth/users must return 409
    const dupCreateRes = await request('POST', '/api/auth/users', {
      email: secretary.email,
      body: {
        name: 'Duplicate Faculty PB43',
        email: createdEmail.toUpperCase(),
        role: 'dean',
      },
    });
    assert.strictEqual(dupCreateRes.status, 409, 'Duplicate account email on POST /api/auth/users must return 409');

    // Changing email of user B to existing email must return 409
    const conflictEmailUpdate = await request('PUT', `/api/auth/users/${dean.id}`, {
      email: secretary.email,
      body: { email: createdEmail },
    });
    assert.strictEqual(conflictEmailUpdate.status, 409);

    // Single whitelist add + duplicate rejection
    const wlSingleEmail = tempEmails[1];
    const addWlRes = await request('POST', '/api/auth/whitelist', {
      email: secretary.email,
      body: { name: 'Whitelist User PB43', email: wlSingleEmail, role: 'student', origin: 'CESS' },
    });
    assert.strictEqual(addWlRes.status, 201);
    const dupWlRes = await request('POST', '/api/auth/whitelist', {
      email: secretary.email,
      body: { name: 'Whitelist Dup PB43', email: wlSingleEmail, role: 'student', origin: 'CESS' },
    });
    assert.strictEqual(dupWlRes.status, 409, 'Duplicate active whitelist entry must return 409');

    // Batch import deduplication within batch + invalid role filtering
    const importDupBatch = await request('POST', '/api/auth/whitelist/import', {
      email: secretary.email,
      body: {
        term: '1st Sem AY 2026-2027',
        entries: [
          { name: 'Batch One', email: tempEmails[2], role: 'student', origin: 'CESS' },
          { name: 'Batch One Dup', email: tempEmails[2].toUpperCase(), role: 'student', origin: 'CESS' },
          { name: 'Batch Two', email: tempEmails[3], role: 'faculty', origin: 'IDS', department: 'Integrated Developmental School' },
          { name: 'Bad Role', email: `badrole.${runTag}@msunaawan.edu.ph`, role: 'superadmin' },
        ],
      },
    });
    assert.strictEqual(importDupBatch.status, 201);
    assert.strictEqual(importDupBatch.body.importedCount, 2);
    assert.strictEqual(importDupBatch.body.duplicateCount, 1);
    assert.strictEqual(importDupBatch.body.invalidEntries.length, 1);
    console.log('  ✅ Duplicate accounts & duplicate batch entries prevented cleanly.');

    // =========================================================================
    // TEST 3: AC4 — Unapproved users cannot gain privileged access
    // =========================================================================
    console.log('▶ Test 3: Ensuring unapproved users cannot gain privileged access...');
    const rogueEmail = tempEmails[4];
    const rogueReg = await request('POST', '/api/auth/register', {
      body: {
        name: 'Rogue Applicant PB43',
        email: rogueEmail,
        password: 'roguePassword123',
        requestedRole: 'secretary',
        origin: 'CESS',
        department: 'Unauthorized Dept',
      },
    });
    assert.strictEqual(rogueReg.status, 202);
    assert.strictEqual(rogueReg.body.status, 'pending');
    assert.strictEqual(rogueReg.body.pending.role, 'student', 'Unapproved registrant must NEVER receive claimed privileged role');
    assert.strictEqual(rogueReg.body.pending.account_status, 'Pending_Verification');
    assert.strictEqual(rogueReg.body.pending.is_whitelisted, false);

    // Check DB user_office has ZERO rows for unapproved registrant
    const { data: rogueOffices } = await supabase
      .from('user_office')
      .select('*')
      .eq('user_id', rogueReg.body.pending.id);
    assert.strictEqual((rogueOffices || []).length, 0, 'Unapproved registrant must have zero privileged user_office rows');

    // Unapproved user cannot sign in, cannot call privileged endpoints, cannot self-approve
    assert.strictEqual(
      (await request('POST', '/api/auth/login', {
        body: { email: rogueEmail, password: 'roguePassword123' },
      })).status,
      403
    );
    assert.strictEqual((await request('POST', '/api/auth/google', { body: { email: rogueEmail } })).status, 403);
    assert.strictEqual((await request('GET', '/api/auth/users', { email: rogueEmail })).status, 403);
    assert.strictEqual((await request('GET', '/api/documents', { email: rogueEmail })).status, 403);
    assert.strictEqual(
      (await request('POST', `/api/auth/pending/${rogueReg.body.pending.id}/approve`, { email: rogueEmail })).status,
      403
    );

    // Reject a pending applicant and ensure they cannot re-register or access system
    const rejEmail = tempEmails[5];
    const rejReg = await request('POST', '/api/auth/register', {
      body: {
        name: 'Rejected Applicant PB43',
        email: rejEmail,
        password: 'rejPassword123',
        requestedRole: 'dean',
      },
    });
    assert.strictEqual(rejReg.status, 202);
    const rejId = rejReg.body.pending.id;
    const rejAction = await request('POST', `/api/auth/pending/${rejId}/reject`, {
      email: secretary.email,
      body: { reason: 'Not verified in HR/Registrar masterlist.' },
    });
    assert.strictEqual(rejAction.status, 200);
    assert.strictEqual(rejAction.body.account_status, 'Inactive');
    assert.strictEqual(
      (await request('POST', '/api/auth/register', {
        body: { name: 'Retry Rejected', email: rejEmail, password: 'rejPassword123' },
      })).status,
      403,
      'Rejected/deactivated user cannot bypass rejection via self-registration'
    );
    console.log('  ✅ Unapproved & rejected users strictly blocked from privileged roles and access.');

    // =========================================================================
    // TEST 4: AC3 — Changes restricted, session-revoked, and fully traceable
    // =========================================================================
    console.log('▶ Test 4: Testing restricted role/status updates & full audit traceability...');
    // Invalid role & self-deactivation rejected
    assert.strictEqual(
      (await request('PATCH', `/api/auth/users/${createdUser.id}/role`, {
        email: secretary.email,
        body: { role: 'root_admin' },
      })).status,
      400
    );
    assert.strictEqual(
      (await request('PATCH', `/api/auth/users/${secretary.id}/status`, {
        email: secretary.email,
        body: { active: false },
      })).status,
      400,
      'Secretary cannot self-deactivate'
    );

    // Promote created user to chairperson via explicit role update, sign in, then deactivate & verify session invalidation
    const promoteRes = await request('PATCH', `/api/auth/users/${createdUser.id}/role`, {
      email: secretary.email,
      body: { role: 'chairperson', origin: 'CESS', reason: 'Appointed Department Chair' },
    });
    assert.strictEqual(promoteRes.status, 200);
    assert.strictEqual(promoteRes.body.user.role, 'chairperson');
    assert(promoteRes.body.user.officeNames.includes('Department Chairperson'));

    const createdLogin = await request('POST', '/api/auth/login', {
      body: { email: createdEmail, password: `pb43.created.${runTag}123` },
    });
    assert.strictEqual(createdLogin.status, 200);
    const activeToken = createdLogin.body.token;
    assert.strictEqual((await request('GET', '/api/auth/me', { token: activeToken })).status, 200);

    // Deactivate user via status endpoint -> must revoke session & office immediately
    const deactivateRes = await request('PATCH', `/api/auth/users/${createdUser.id}/status`, {
      email: secretary.email,
      body: { active: false, reason: 'Term ended' },
    });
    assert.strictEqual(deactivateRes.status, 200);
    assert.strictEqual(deactivateRes.body.user.active, false);
    assert.strictEqual(deactivateRes.body.user.officeNames.length, 0);
    assert.strictEqual((await request('GET', '/api/auth/me', { token: activeToken })).status, 401);

    // Remove whitelist entry via DELETE /api/auth/whitelist/:id
    const wlUser = addWlRes.body.user;
    const delWlRes = await request('DELETE', `/api/auth/whitelist/${wlUser.id}`, {
      email: secretary.email,
      body: { reason: 'Transferred out' },
    });
    assert.strictEqual(delWlRes.status, 200, `Expected 200 on DELETE whitelist, got ${delWlRes.status}: ${JSON.stringify(delWlRes.body)}`);
    assert.strictEqual(delWlRes.body.deleted, true);
    assert.strictEqual(delWlRes.body.user.is_whitelisted, false);
    assert.strictEqual(delWlRes.body.user.active, false);

    // Approve rogue pending user cleanly by explicit Secretary decision
    const approveRes = await request('POST', `/api/auth/pending/${rogueReg.body.pending.id}/approve`, {
      email: secretary.email,
      body: { role: 'student', origin: 'CESS', department: 'BSEd Science', reason: 'Verified ID' },
    });
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.user.account_status, 'Active');
    assert.strictEqual(approveRes.body.user.is_whitelisted, true);

    // Duplicate approve of already processed user must fail (409)
    assert.strictEqual(
      (await request('POST', `/api/auth/pending/${rogueReg.body.pending.id}/approve`, {
        email: secretary.email,
      })).status,
      409
    );

    // Verify traceable audit logs contain structured actor/target/before/after records
    const auditRes = await request('GET', '/api/auth/audit-logs?limit=100', { email: secretary.email });
    assert.strictEqual(auditRes.status, 200);
    const actions = new Set(auditRes.body.logs.map((l) => l.action));
    for (const expectedAction of [
      'user_created',
      'duplicate_account_blocked',
      'whitelist_entry_added',
      'whitelist_imported',
      'whitelist_removed',
      'privilege_escalation_blocked',
      'registration_rejected',
      'registration_approved',
      'user_role_changed',
      'user_status_changed',
    ]) {
      assert(actions.has(expectedAction), `Expected audit log action '${expectedAction}' to be recorded`);
    }
    const roleChangeLog = auditRes.body.logs.find(
      (l) => l.action === 'user_role_changed' && l.targetUserId === createdUser.id
    );
    assert(roleChangeLog && roleChangeLog.actorEmail === secretary.email);
    assert.strictEqual(roleChangeLog.before.role, 'faculty');
    assert.strictEqual(roleChangeLog.after.role, 'chairperson');
    assert(roleChangeLog.timestamp);
    console.log('  ✅ Restricted mutations, session/office revocation & full audit traceability verified.');

    console.log('\n🎉 ALL PB-43 USER, ROLE & WHITELIST MANAGEMENT TESTS PASSED!\n');
  } finally {
    console.log('🧹 Cleaning up temporary PB-43 test users...');
    for (const email of tempEmails) {
      await deleteTestUserByEmail(email);
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PB-43 TEST SUITE FAILED:', err);
    process.exit(1);
  });

