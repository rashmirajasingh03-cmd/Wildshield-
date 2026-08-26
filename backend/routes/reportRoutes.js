const express = require('express');
const { authenticate } = require('../middleware/auth');
const Analysis = require('../models/Analysis');
const Report = require('../models/Report');
const { generateReport } = require('../services/reportService');

const router = express.Router();

router.use(authenticate);

router.post('/:analysisId', async (req, res, next) => {
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
});

router.get('/:analysisId', async (req, res, next) => {
  try {
    const reports = await Report.find({ analysisId: req.params.analysisId })
      .sort('-createdAt')
      .lean();
    res.status(200).json({ success: true, reports });
  } catch (err) {
    next(err);
  }
});

router.get('/download/:reportId', async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    const fs = require('fs');
    if (!fs.existsSync(report.path)) {
      return res.status(404).json({ success: false, message: 'Report file not found on disk.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    fs.createReadStream(report.path).pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
