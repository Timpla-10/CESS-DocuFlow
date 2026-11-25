/**
 * Integration Test Suite for Ticket PB-42:
 * "Email notification log [P1]" (SRS 3.10 REQ-NOT-4)
 *
 * Acceptance Criteria Verified:
 *   1. Log records event, recipient, time, result, and safe error details
 *   2. Access is restricted to the College Secretary (401 unauth, 403 non-Secretary)
 *   3. Sensitive contents/passwords/OTPs/tokens are NEVER exposed in logs
 *   4. Email failure does not corrupt request state & can be safely retried
 *   5. PO Note: Secretary sees all system emails and only workflow notifications
 */
const assert = require('assert');
const { initializeStagingTestEnvironment } = require('./stagingSafetyGuard');

// Fail closed BEFORE importing ../server or ../config/database so no Supabase client
// is initialized unless explicitly targeting the verified staging Supabase project.
initializeStagingTestEnvironment();

const app = require('../server');
const supabase = require('../config/database');
const mailer = require('../config/mailer');
const EmailService = require('../services/emailService');
const NotificationModel = require('../models/notificationModel');
const DocumentModel = require('../models/documentModel');
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
  console.log('🧪 RUNNING PB-42 TESTS: EMAIL NOTIFICATION LOG');
  console.log('================================================================\n');

  await seedAccounts();
  const student = await UserModel.findByEmail('student@msunaawan.edu.ph');
  assert.ok(student?.id, 'Student seed user required');

  const server = app.listen(0);
  const baseUrl = `http://localhost:${server.address().port}/api`;
  const origSendMail = mailer.transporter.sendMail.bind(mailer.transporter);
  const origIsConfigured = mailer.isConfigured;

  const createdDocIds = [];
  const createdLogIds = [];

  const request = async (path, options = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  const secHeaders = { 'x-user-email': 'secretary@msunaawan.edu.ph' };
  const stuHeaders = { 'x-user-email': 'student@msunaawan.edu.ph' };
  const facHeaders = { 'x-user-email': 'faculty@msunaawan.edu.ph' };
  const chairHeaders = { 'x-user-email': 'chairperson@msunaawan.edu.ph' };
  const deanHeaders = { 'x-user-email': 'dean@msunaawan.edu.ph' };

  try {
    // 1. Access control (AC 2)
    console.log('1️⃣  Testing Access Control on /api/notifications/logs...');
    assert.strictEqual((await request('/notifications/logs')).status, 401);
    for (const hdr of [stuHeaders, facHeaders, chairHeaders, deanHeaders]) {
      assert.strictEqual((await request('/notifications/logs', { headers: hdr })).status, 403);
    }
    const secOk = await request('/notifications/logs', { headers: secHeaders });
    assert.strictEqual(secOk.status, 200);
    assert.ok(Array.isArray(secOk.body.logs));
    console.log('   ✅ Access strictly restricted to College Secretary (401/403 enforced).\n');

    // 2. Sensitive content & password/OTP/token redaction (AC 3)
    console.log('2️⃣  Testing Sensitive Content & OTP/Password Redaction...');
    let capturedEmailCount = 0;
    mailer.isConfigured = true;
    mailer.transporter.sendMail = async () => {
      capturedEmailCount += 1;
      return { messageId: `mock-pb42-${Date.now()}-${capturedEmailCount}` };
    };

    const secretOtp = '849201';
    const secretToken = 'tok_super_secret_recovery_9911';
    const secretPassword = 'MySuperSecretPassword!42';

    const resetEmailRes = await EmailService.sendPasswordResetEmail({
      to: student.email,
      name: student.name,
      code: secretOtp,
      resetUrl: `https://docuflow.msunaawan.edu.ph/reset?token=${secretToken}&password=${secretPassword}`,
      expiresInMinutes: 15,
    });
    assert.strictEqual(resetEmailRes.success, true);
    if (resetEmailRes.logId) createdLogIds.push(resetEmailRes.logId);

    const logsAfterReset = await request(`/notifications/logs?recipientId=${student.id}`, { headers: secHeaders });
    assert.strictEqual(logsAfterReset.status, 200);
    const logsText = JSON.stringify(logsAfterReset.body);

    assert.strictEqual(logsText.includes(secretOtp), false, 'OTP leaked in logs!');
    assert.strictEqual(logsText.includes(secretToken), false, 'Reset token leaked in logs!');
    assert.strictEqual(logsText.includes(secretPassword), false, 'Password leaked in logs!');

    // Retry must be blocked for sensitive OTP auth emails
    if (resetEmailRes.logId) {
      const otpLogDetail = await request(`/notifications/logs/${resetEmailRes.logId}`, { headers: secHeaders });
      assert.strictEqual(otpLogDetail.status, 200);
      assert.strictEqual(otpLogDetail.body.log.retryable, false);
    }
    console.log('   ✅ Passwords, 6-digit OTPs, and recovery tokens redacted cleanly from log payloads.\n');

    // 3. Simulated email failure must not corrupt request state + records safe error + supports retry (AC 1 & AC 4)
    console.log('3️⃣  Testing Email Failure Resilience, Safe Error Details & Retry...');
    mailer.transporter.sendMail = async () => {
      const err = new Error(`550 Relay denied smtp_pass=TopSecretSmtpPass! at host mail.internal\n    at SMTPConnection.send (smtp.js:42:10)`);
      throw err;
    };

    const submitRes = await request('/documents', {
      method: 'POST',
      headers: stuHeaders,
      body: JSON.stringify({
        title: 'PB-42 Failure Resilience Test Request',
        document_type: 'Endorsement Letter',
        description: 'Testing email failure resilience during workflow submission.',
        attachments: [{ name: 'Form.pdf', url: '/uploads/form.pdf', sizeKb: 100 }],
      }),
    });
    assert.strictEqual(submitRes.status, 201, `Document submission failed when SMTP failed: ${JSON.stringify(submitRes.body)}`);
    const createdDoc = submitRes.body.document || submitRes.body;
    const createdDocId = createdDoc.document_id || createdDoc.id;
    createdDocIds.push(createdDocId);
    assert.strictEqual(createdDoc.current_status, 'Submitted', 'Document state corrupted after email failure!');

    // Also dispatch a failed direct email tied to this doc to verify exact retry & safeError
    const failMail = await EmailService.sendMail({
      to: student.email,
      recipientId: student.id,
      documentId: createdDocId,
      notificationType: 'Return_Alert',
      subject: `[CESS DocuFlow] Return Notice for ${createdDoc.control_number}`,
      text: 'Action required: Please attach official receipt.',
      html: '<p>Action required: Please attach official receipt.</p>',
    });
    assert.strictEqual(failMail.success, false);
    assert.ok(failMail.logId, 'Expected logId for failed email delivery');
    createdLogIds.push(failMail.logId);

    const failLogDetailRes = await request(`/notifications/logs/${failMail.logId}`, { headers: secHeaders });
    assert.strictEqual(failLogDetailRes.status, 200);
    const failEntry = failLogDetailRes.body.log;
    assert.strictEqual(failEntry.result, 'Failed');
    assert.strictEqual(failEntry.event, 'Document Returned Notice');
    assert.strictEqual(failEntry.category, 'workflow');
    assert.strictEqual(failEntry.recipientSummary.email, student.email);
    assert.ok(failEntry.timestamp);
    assert.ok(failEntry.safeError && failEntry.safeError.includes('550 Relay denied'));
    assert.strictEqual(failEntry.safeError.includes('TopSecretSmtpPass!'), false, 'SMTP credential leaked in safeError!');
    assert.strictEqual(failEntry.safeError.includes('at SMTPConnection.send'), false, 'Raw stack trace leaked in safeError!');
    assert.strictEqual(failEntry.retryable, true);

    // Non-secretary retry forbidden
    assert.strictEqual(
      (await request(`/notifications/logs/${failMail.logId}/retry`, { method: 'POST', headers: stuHeaders })).status,
      403
    );

    // Restore working transport and retry failed email
    mailer.transporter.sendMail = async () => ({ messageId: `retry-ok-${Date.now()}` });
    const retryRes = await request(`/notifications/logs/${failMail.logId}/retry`, {
      method: 'POST',
      headers: secHeaders,
    });
    assert.strictEqual(retryRes.status, 200);
    assert.strictEqual(retryRes.body.delivered, true);
    assert.strictEqual(retryRes.body.log.status, 'Sent');
    assert.strictEqual(retryRes.body.retryAudit.retryCount, 1);

    // Re-trying an already sent log returns 400
    assert.strictEqual(
      (await request(`/notifications/logs/${failMail.logId}/retry`, { method: 'POST', headers: secHeaders })).status,
      400
    );
    console.log('   ✅ Email failure preserved request state, redacted error details cleanly, and retry succeeded.\n');

    // 4. PO Note Scoping: All system emails & only workflow notifications (filters & totals)
    console.log('4️⃣  Testing PO Note Visibility Scope, Filters & Summary Totals...');
    const personalNonWorkflow = await NotificationModel.createLog({
      recipientId: student.id,
      documentId: null,
      notificationType: 'Status_Update',
      deliveryMethod: 'In_System',
      title: 'Private Personal Note Should Not Leak To Audit Log',
      message: 'Internal personal inbox note unrelated to workflow or system email.',
      status: 'Sent',
    });
    createdLogIds.push(personalNonWorkflow.notification_id);

    const sysEmail = await NotificationModel.createLog({
      recipientId: student.id,
      documentId: null,
      notificationType: 'Status_Update',
      deliveryMethod: 'Email',
      title: 'PB-42 System Account Advisory',
      message: 'Account advisory notice delivered by email.',
      status: 'Sent',
    });
    createdLogIds.push(sysEmail.notification_id);

    const workflowNotice = await NotificationModel.createLog({
      recipientId: student.id,
      documentId: createdDocId,
      notificationType: 'Release_Alert',
      deliveryMethod: 'In_System',
      title: 'PB-42 Workflow Release Notice',
      message: 'Workflow document approved for release.',
      status: 'Sent',
    });
    createdLogIds.push(workflowNotice.notification_id);

    const scopedLogsRes = await request(`/notifications/logs?recipientId=${student.id}&limit=100`, {
      headers: secHeaders,
    });
    assert.strictEqual(scopedLogsRes.status, 200);
    const idsVisible = new Set(scopedLogsRes.body.logs.map((l) => l.notification_id));
    assert.strictEqual(idsVisible.has(personalNonWorkflow.notification_id), false, 'Personal non-workflow non-email log leaked!');
    assert.strictEqual(idsVisible.has(sysEmail.notification_id), true, 'System email missing from Secretary log!');
    assert.strictEqual(idsVisible.has(workflowNotice.notification_id), true, 'Workflow notification missing from Secretary log!');
    assert.strictEqual(
      (await request(`/notifications/logs/${personalNonWorkflow.notification_id}`, { headers: secHeaders })).status,
      403
    );

    const wfOnly = await request(`/notifications/logs?recipientId=${student.id}&category=workflow&search=Release Notice`, {
      headers: secHeaders,
    });
    assert.strictEqual(wfOnly.status, 200);
    assert.ok(wfOnly.body.logs.some((l) => l.notification_id === workflowNotice.notification_id));
    assert.ok(wfOnly.body.logs.every((l) => l.category === 'workflow'));

    const sysOnly = await request(`/notifications/logs?recipientId=${student.id}&category=system_email&search=Advisory`, {
      headers: secHeaders,
    });
    assert.strictEqual(sysOnly.status, 200);
    assert.ok(sysOnly.body.logs.some((l) => l.notification_id === sysEmail.notification_id));
    assert.ok(sysOnly.body.logs.every((l) => l.category === 'system_email'));

    console.log('   ✅ Secretary sees all system emails + workflow notifications cleanly with working filters.\n');
    console.log('================================================================');
    console.log('🎉 ALL PB-42 TESTS PASSED!');
    console.log('================================================================');
  } finally {
    mailer.transporter.sendMail = origSendMail;
    mailer.isConfigured = origIsConfigured;
    for (const logId of createdLogIds) {
      await supabase.from('notification_log').delete().eq('notification_id', logId);
    }
    for (const docId of createdDocIds) {
      await DocumentModel.softDelete(docId);
    }
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ PB-42 TEST FAILED:', err);
  process.exit(1);
});

