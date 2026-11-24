/**
 * Test Sending Live Notification Emails to Specified Address
 * Target: llamperouge957@gmail.com
 */
const EmailService = require('../services/emailService');

const TARGET_EMAIL = 'llamperouge957@gmail.com';
const TARGET_NAME = 'Lelouch Lamperouge';

async function sendLiveNotificationTests() {
  console.log('========================================================================');
  console.log(`🚀 SENDING LIVE TEST NOTIFICATIONS TO: ${TARGET_EMAIL}`);
  console.log('========================================================================\n');

  console.log('1️⃣  Verifying SMTP Connection with smtp.gmail.com:587...');
  const isConnected = await EmailService.verifySmtp();
  if (!isConnected) {
    throw new Error('SMTP connection failed. Check credentials in .env');
  }
  console.log('   ✅ SMTP connection is verified and online.\n');

  // Test 1: PB-17 Document Request Submission Confirmation with Control Number
  console.log('2️⃣  Sending PB-17: Document Submission Confirmation & Control Number...');
  const controlNo = `MSU-CESS-${Math.floor(100000 + Math.random() * 900000)}-2026`;
  const subRes = await EmailService.sendSubmissionConfirmationEmail({
    to: TARGET_EMAIL,
    name: TARGET_NAME,
    controlNumber: controlNo,
    title: 'Application for Graduation Clearance & Academic Evaluation',
    documentType: 'Graduation Clearance Form',
  });
  if (!subRes.success) {
    throw new Error(`Failed to send submission email: ${JSON.stringify(subRes)}`);
  }
  console.log(`   ✅ Sent Submission Confirmation!`);
  console.log(`      Control Number: ${controlNo}`);
  console.log(`      Message ID: ${subRes.messageId}\n`);

  // Test 2: PB-22 Action Needed: Document Returned for Revision
  console.log('3️⃣  Sending PB-22: Document Returned for Revision Notification...');
  const returnRes = await EmailService.sendReturnForRevisionEmail({
    to: TARGET_EMAIL,
    name: TARGET_NAME,
    controlNumber: controlNo,
    title: 'Application for Graduation Clearance & Academic Evaluation',
    returnedByOffice: 'Department Chairperson',
    remarks: 'Please upload a clearer scanned copy of the signed Clearance Sheet (Section B was unreadable).',
  });
  if (!returnRes.success) {
    throw new Error(`Failed to send revision return email: ${JSON.stringify(returnRes)}`);
  }
  console.log(`   ✅ Sent Return for Revision Alert!`);
  console.log(`      Returning Office: Department Chairperson`);
  console.log(`      Message ID: ${returnRes.messageId}\n`);

  // Test 3: PB-03 Password Reset Verification Code & Security Alert
  console.log('4️⃣  Sending PB-03: Password Reset 6-Digit OTP Verification Code...');
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const resetRes = await EmailService.sendPasswordResetEmail({
    to: TARGET_EMAIL,
    name: TARGET_NAME,
    code: otpCode,
    resetToken: 'live-test-token-778899',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (!resetRes.success) {
    throw new Error(`Failed to send password reset email: ${JSON.stringify(resetRes)}`);
  }
  console.log(`   ✅ Sent Password Reset Verification Code!`);
  console.log(`      OTP Code: ${otpCode}`);
  console.log(`      Message ID: ${resetRes.messageId}\n`);

  console.log('========================================================================');
  console.log('🎉 ALL NOTIFICATION EMAILS DELIVERED SUCCESSFULLY!');
  console.log(`   Please check inbox (and Spam/Promotions folder) of: ${TARGET_EMAIL}`);
  console.log('========================================================================\n');
  process.exit(0);
}

sendLiveNotificationTests().catch((err) => {
  console.error('\n❌ Failed to send notifications:', err);
  process.exit(1);
});
