const express = require('express');

const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');

const router = express.Router();

// Phase 1: health + auth stubs.
// Later phases mount: /videos, /analysis, /detections, /reports,
// /wildlife, /dashboard (see section 22 of the spec).
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

module.exports = router;
