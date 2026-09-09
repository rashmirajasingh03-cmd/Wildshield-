const express = require('express');
const fs = require('fs');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const Analysis = require('../models/Analysis');
const Report = require('../models/Report');
const { generateReport } = require('../services/reportService');

const router = express.Router();

// Auth required for everything in this router.
router.use(authenticate);

// Generate a report — OFFICERS only (viewers are read-only, admins manage
// officers and do not touch analysis reports).
router.post(
  '/:analysisId',
  requireRole('officer'),
  requirePermission('reports:generate'),
  async (req, res, next) => {
    try {
      const { analysisId } = req.params;
      const analysis = await Analysis.findById(analysisId);
      if (!analysis) {
        return res.status(404).json({ success: false, message: 'Analysis not found.' });
      }
      if (analysis.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Analysis is not yet completed.',
        });
      }

      const report = await generateReport(analysisId, req.user._id);
      res.status(201).json({ success: true, report });
    } catch (err) {
      next(err);
    }
  }
);

// List all reports (read-only view) — OFFICERS and VIEWERS.
router.get(
  '/',
  requireRole('officer', 'viewer'),
  requirePermission('reports:view'),
  async (req, res, next) => {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 50);
      const skip = (page - 1) * limit;

      const [total, reports] = await Promise.all([
        Report.countDocuments(),
        Report.find()
          .populate({
            path: 'analysisId',
            select: 'videoId threatResult summary status createdAt',
            populate: { path: 'videoId', select: 'originalName' },
          })
          .sort('-createdAt')
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      res.status(200).json({
        success: true,
        count: reports.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        reports,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Download the latest report for an analysis — OFFICERS and VIEWERS.
router.get(
  '/download/:analysisId',
  requireRole('officer', 'viewer'),
  requirePermission('reports:download'),
  async (req, res, next) => {
    try {
      const report = await Report.findOne({ analysisId: req.params.analysisId })
        .sort('-createdAt');
      if (!report) {
        return res.status(404).json({ success: false, message: 'No report found for this analysis.' });
      }
      if (!fs.existsSync(report.path)) {
        return res.status(404).json({ success: false, message: 'Report file not found on disk.' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      fs.createReadStream(report.path).pipe(res);
    } catch (err) {
      next(err);
    }
  }
);

// Reports for a single analysis — OFFICERS and VIEWERS.
router.get(
  '/:analysisId',
  requireRole('officer', 'viewer'),
  requirePermission('reports:view'),
  async (req, res, next) => {
    try {
      const reports = await Report.find({ analysisId: req.params.analysisId })
        .sort('-createdAt')
        .lean();
      res.status(200).json({ success: true, reports });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;