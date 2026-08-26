const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  startAnalysis,
  getAnalyses,
  getAnalysis,
  getDashboardStats,
} = require('../controllers/analysisController');

const router = express.Router();

router.use(authenticate);

router.post('/run', authorize('ADMIN', 'FOREST_OFFICIAL'), startAnalysis);
router.get('/dashboard', getDashboardStats);
router.get('/', getAnalyses);
router.get('/:id', getAnalysis);

module.exports = router;
