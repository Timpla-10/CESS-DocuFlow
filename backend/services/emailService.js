const { transporter, defaultFrom, isConfigured, user: smtpUser } = require('../config/mailer');

/**
 * Base email layout wrapper with MSU at Naawan / CESS DocuFlow branding.
 */
function wrapHtmlLayout(title, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F1FA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E1035;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F4F1FA; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(76, 40, 130, 0.1); border: 1px solid #E9D5FF;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4C2882 0%, #6B21A8 100%); padding: 28px 32px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #E9D5FF;">
                      MSU at Naawan • College of Education and Social Sciences
                    </div>
                    <div style="font-size: 22px; font-weight: 800; color: #FFFFFF; margin-top: 4px; letter-spacing: -0.02em;">
                      CESS DocuFlow
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FAF5FF; padding: 20px 32px; border-top: 1px solid #F3E8FF; text-align: center; font-size: 12px; color: #6B7280; line-height: 1.5;">
              <div>This is an automated university notification from <strong>CESS DocuFlow</strong>.</div>
              <div style="margin-top: 4px;">Mindanao State University at Naawan • 9023 Naawan, Misamis Oriental, Philippines</div>
              <div style="margin-top: 6px; font-size: 11px; color: #9CA3AF;">Office of the College Secretary • Support: cessdocuflow@gmail.com</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const EmailService = {
  /**
   * Verify SMTP connectivity
   */
  async verifySmtp() {
    if (!isConfigured) {
      console.warn('⚠️ SMTP credentials not fully configured in backend/.env');
      return false;
    }
    try {
      await transporter.verify();
      console.log('✅ Nodemailer SMTP connection verified successfully.');
      return true;
    } catch (err) {
      console.error('❌ Nodemailer SMTP verification failed:', err.message);
      return false;
    }
  },

  /**
   * Send a raw email
   */
  async sendMail({ to, subject, html, text }) {
    if (!isConfigured) {
      console.warn(`⚠️ [Nodemailer skipped - no credentials] To: ${to} | Subject: ${subject}`);
      return { success: false, reason: 'smtp_not_configured' };
    }

    try {
      const info = await transporter.sendMail({
        from: defaultFrom,
        to,
        subject,
        text,
        html,
      });

      console.log(`📧 [Nodemailer sent] ID: ${info.messageId} | To: ${to} | Subject: ${subject}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`❌ [Nodemailer error] Failed to send to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * PB-03: Send Password Reset Verification Code & Recovery Link
   */
  async sendPasswordResetEmail({ to, name = 'Valued User', code = '658485', resetToken, expiresAt }) {
    const formattedExpires = expiresAt
      ? new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '15 minutes';

    const resetUrl = `http://localhost:5173/forgot-password?email=${encodeURIComponent(to)}&token=${encodeURIComponent(resetToken || '')}`;

    const contentHtml = `
      <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #1E1035;">
        Password Reset Request
      </h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #4B5563;">
        Hello <strong>${name}</strong>,<br>
        We received a request to reset your password for your institutional account (<code>${to}</code>) on <strong>CESS DocuFlow</strong>.
      </p>

      <div style="background-color: #FAF5FF; border: 1.5px dashed #A855F7; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #7C3AED; margin-bottom: 6px;">
          Your 6-Digit Verification Code
        </div>
        <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #4C2882;">
          ${code}
        </div>
        <div style="font-size: 11px; color: #6B7280; margin-top: 8px;">
          This code expires in <strong>${formattedExpires}</strong>. Single-use only.
        </div>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #7C3AED 0%, #6B21A8 100%); color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);">
          Reset Password in DocuFlow
        </a>
      </div>

      <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 16px; border-radius: 4px; margin-top: 24px;">
        <div style="font-size: 12px; font-weight: 700; color: #991B1B;">Security Reminder (PB-03)</div>
        <div style="font-size: 12px; color: #7F1D1D; margin-top: 2px; line-height: 1.5;">
          If you did not request this password reset, please ignore this email or contact the College Secretary immediately. Your password has not been changed.
        </div>
      </div>
    `;

    const text = `CESS DocuFlow - Password Reset Verification Code\n\n` +
      `Hello ${name},\n\n` +
      `We received a request to reset your password for your institutional account (${to}).\n\n` +
      `YOUR 6-DIGIT VERIFICATION CODE: ${code}\n\n` +
      `This code expires in ${formattedExpires}. Enter this code on the password reset screen or open:\n` +
      `${resetUrl}\n\n` +
      `If you did not request this, please contact the College Secretary.`;

    return this.sendMail({
      to,
      subject: `[CESS DocuFlow] Password Reset Verification Code: ${code}`,
      html: wrapHtmlLayout('Password Reset Request', contentHtml),
      text,
    });
  },

  /**
   * Account Registration Submitted (Pending College Secretary verification)
   */
  async sendRegistrationQueuedEmail({ to, name = 'Applicant', requestedRole, department }) {
    const contentHtml = `
      <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #1E1035;">
        Registration Received
      </h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #4B5563;">
        Hello <strong>${name}</strong>,<br>
        Thank you for registering with <strong>CESS DocuFlow</strong>. Your application details have been received and queued for manual verification:
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3E8FF; font-weight: 600; color: #4B5563; width: 40%;">Institutional Email:</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3E8FF; color: #1E1035;"><code>${to}</code></td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3E8FF; font-weight: 600; color: #4B5563;">Requested Role:</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3E8FF; color: #1E1035; text-transform: capitalize;">${requestedRole}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3E8FF; font-weight: 600; color: #4B5563;">Department / Program:</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #F3E8FF; color: #1E1035;">${department || 'CESS'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #4B5563;">Status:</td>
          <td style="padding: 8px 12px; color: #D97706; font-weight: 700;">Pending Secretary Approval</td>
        </tr>
      </table>

      <p style="margin: 16px 0; font-size: 13px; line-height: 1.6; color: #4B5563;">
        Because your email was not yet on the pre-loaded semester whitelist, College Secretary <strong>Ms. Carmela Ortiz</strong> will review your enrollment or employment credentials. You will receive an approval email once your account is active.
      </p>
    `;

    return this.sendMail({
      to,
      subject: `[CESS DocuFlow] Registration Received — Pending Verification`,
      html: wrapHtmlLayout('Registration Received', contentHtml),
      text: `Hello ${name},\n\nYour registration request for CESS DocuFlow (${to}) has been received and is pending verification with the College Secretary.\n\nRole: ${requestedRole}\nDepartment: ${department}\n\nYou will receive a notification once approved.`,
    });
  },

  /**
   * Account Verified & Activated Email
   */
  async sendAccountActivatedEmail({ to, name = 'University Member', role, department }) {
    const signInUrl = 'http://localhost:5173/sign-in';

    const contentHtml = `
      <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #047857;">
        🎉 Account Activated!
      </h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #4B5563;">
        Hello <strong>${name}</strong>,<br>
        Great news! Your account on <strong>CESS DocuFlow</strong> has been verified and activated.
      </p>

      <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <div style="font-size: 13px; font-weight: 700; color: #065F46;">Verified Credentials:</div>
        <div style="font-size: 13px; color: #047857; margin-top: 4px;">
          • Email: <strong>${to}</strong><br>
          • Role: <strong style="text-transform: capitalize;">${role}</strong><br>
          • Department: <strong>${department || 'CESS'}</strong>
        </div>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${signInUrl}" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);">
          Sign In to DocuFlow
        </a>
      </div>
    `;

    return this.sendMail({
      to,
      subject: `[CESS DocuFlow] Account Verified & Activated — Welcome!`,
      html: wrapHtmlLayout('Account Activated', contentHtml),
      text: `Hello ${name},\n\nYour CESS DocuFlow account (${to}) has been verified and activated!\n\nRole: ${role}\nDepartment: ${department}\n\nSign in at: ${signInUrl}`,
    });
  },

  /**
   * Password Changed Security Alert (PB-03)
   */
  async sendPasswordChangedAlert({ to, name = 'User' }) {
    const contentHtml = `
      <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #1E1035;">
        Account Security Alert: Password Changed
      </h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #4B5563;">
        Hello <strong>${name}</strong>,<br>
        The password for your CESS DocuFlow account (<code>${to}</code>) was successfully updated on <strong>${new Date().toLocaleString()}</strong>.
      </p>

      <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
        <div style="font-size: 12px; font-weight: 700; color: #92400E;">Did not make this change?</div>
        <div style="font-size: 12px; color: #78350F; margin-top: 2px; line-height: 1.5;">
          If you did not perform this action, please reset your password immediately using the university recovery flow and notify the College Secretary.
        </div>
      </div>
    `;

    return this.sendMail({
      to,
      subject: `[CESS DocuFlow Security Alert] Your Password Was Changed`,
      html: wrapHtmlLayout('Security Alert: Password Changed', contentHtml),
      text: `Hello ${name},\n\nThe password for your CESS DocuFlow account (${to}) was changed on ${new Date().toLocaleString()}.\n\nIf you did not make this change, please reset your password immediately.`,
    });
  },
};

module.exports = EmailService;

