const express = require('express');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const {
  startAnalysis,
  getAnalyses,
  getAnalysis,
  getDashboardStats,
} = require('../controllers/analysisController');

const router = express.Router();

// AI detection / monitoring is OFFICER-only. Viewers consume reports, not
// live detection pipelines; admins manage officers.
router.use(authenticate, requireRole('officer'));

router.post('/run', requirePermission('analysis:run'), startAnalysis);
router.get('/dashboard', getDashboardStats);
router.get('/', getAnalyses);
router.get('/:id', getAnalysis);

module.exports = router;