const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const serverConfig = require('./config/server');
const swaggerSpec = require('./config/swagger');
const apiRoutes = require('./routes');
const { sanitizeForLog } = require('./services/authService');

const app = express();

app.use(cors());
app.use(express.json());

// Swagger API Documentation (Interactive UI & Raw JSON Spec)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'CESS DocuFlow API Docs',
}));
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Root status endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'CESS-DocuFlow Backend Server',
    database: 'Supabase PostgreSQL Connected',
    documentation: '/api-docs',
    endpoints: {
      docs: '/api-docs',
      docsJson: '/api-docs.json',
      health: '/api/health',
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      forgotPassword: 'POST /api/auth/forgot-password',
      resetPassword: 'POST /api/auth/reset-password',
      changePassword: 'POST /api/auth/change-password',
      me: 'GET /api/auth/me',
      whitelist: 'GET /api/auth/whitelist',
      pending: 'GET /api/auth/pending',
      documents: 'GET /api/documents',
      documentTypes: 'GET /api/document-types',
      routes: 'GET /api/workflow/routes',
      directory: 'GET /api/directory',
    },
  });
});

// Mount API routes
app.use('/api', apiRoutes);

// Global error handler (PB-03: ensures passwords are never exposed in error payloads or logs)
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const bodySecrets = [
    req.body?.password,
    req.body?.currentPassword,
    req.body?.newPassword,
    req.body?.confirmPassword,
  ].filter(Boolean);
  const safeMessage = sanitizeForLog(err.message || 'Internal Server Error', bodySecrets);
  res.status(status).json({
    error: safeMessage,
  });
});

if (require.main === module) {
  app.listen(serverConfig.port, () => {
    console.log(`🚀 CESS-DocuFlow Backend running on http://localhost:${serverConfig.port}`);
  });
}

module.exports = app;
