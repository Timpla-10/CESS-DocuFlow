const express = require('express');
const cors = require('cors');
const serverConfig = require('./config/server');
const apiRoutes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());

// Root status endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'CESS-DocuFlow Backend Server',
    database: 'Supabase PostgreSQL Connected',
    endpoints: {
      health: '/api/health',
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      me: 'GET /api/auth/me',
      whitelist: 'GET /api/auth/whitelist',
      pending: 'GET /api/auth/pending',
      documents: 'GET /api/documents',
    },
  });
});

// Mount API routes
app.use('/api', apiRoutes);

// Global error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

if (require.main === module) {
  app.listen(serverConfig.port, () => {
    console.log(`🚀 CESS-DocuFlow Backend running on http://localhost:${serverConfig.port}`);
  });
}

module.exports = app;
