/**
 * Integration Test for Nodemailer SMTP Configuration
 */
const assert = require('assert');
const EmailService = require('../services/emailService');
const { isConfigured, host, port, user } = require('../config/mailer');

async function testNodemailer() {
  console.log('================================================================');
  console.log('🧪 RUNNING NODEMAILER SMTP INTEGRATION TESTS');
  console.log('================================================================\n');

  console.log(`1️⃣  Checking SMTP Environment Configuration...`);
  console.log(`   Host: ${host}`);
  console.log(`   Port: ${port}`);
  console.log(`   User: ${user}`);
  console.log(`   Configured: ${isConfigured}`);
  assert.strictEqual(isConfigured, true, 'Expected SMTP credentials to be configured in .env');
  console.log(`   ✅ SMTP settings detected and populated.\n`);

  console.log(`2️⃣  Verifying SMTP Connection with ${host}...`);
  const isConnected = await EmailService.verifySmtp();
  assert.strictEqual(isConnected, true, 'Expected SMTP transporter connection to succeed');
  console.log(`   ✅ Nodemailer SMTP handshake and authentication verified!\n`);

  console.log(`3️⃣  Testing Send Password Reset Email (to self: ${user})...`);
  const sendRes = await EmailService.sendPasswordResetEmail({
    to: user,
    name: 'DocuFlow Admin',
    code: '658485',
    resetToken: 'test-token-abcdef123456',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });

  assert.strictEqual(sendRes.success, true, `Expected email send to succeed, got: ${JSON.stringify(sendRes)}`);
  assert.ok(sendRes.messageId, 'Expected messageId in response');
  console.log(`   ✅ Real email delivered to ${user}! Message ID: ${sendRes.messageId}\n`);

  console.log('================================================================');
  console.log('🎉 ALL NODEMAILER TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
  process.exit(0);
}

testNodemailer().catch((err) => {
  console.error('❌ Nodemailer test failed:', err);
  process.exit(1);
});

