const express = require('express');

const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const videoRoutes = require('./videoRoutes');
const analysisRoutes = require('./analysisRoutes');
const reportRoutes = require('./reportRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/videos', videoRoutes);
router.use('/analysis', analysisRoutes);
router.use('/reports', reportRoutes);

module.exports = router;
