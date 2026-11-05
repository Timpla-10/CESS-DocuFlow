const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = Number(process.env.SMTP_PORT) || 587;
const secure = process.env.SMTP_SECURE === 'true' || port === 465;
const user = process.env.SMTP_USER || '';
const rawPass = process.env.SMTP_PASS || '';
const pass = rawPass.replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: {
    user,
    pass,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const defaultFrom =
  process.env.SMTP_FROM ||
  (user ? `"Office of the Docuflow" <${user}>` : '"Office of the Docuflow" <cessdocuflow@gmail.com>');

const isConfigured = Boolean(user && pass);

module.exports = {
  transporter,
  defaultFrom,
  isConfigured,
  host,
  port,
  user,
};

