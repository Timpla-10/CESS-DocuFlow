const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const documentRoutes = require('./documentRoutes');

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CESS-DocuFlow Backend API',
    ticket: 'PB-02 Role Verification & Role-Based Access',
  });
});

router.use('/auth', authRoutes);
router.use('/documents', documentRoutes);

module.exports = router;

