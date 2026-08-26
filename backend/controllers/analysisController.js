const axios = require('axios');
const Analysis = require('../models/Analysis');
const Video = require('../models/Video');
const env = require('../config/env');

exports.startAnalysis = async (req, res, next) => {
  try {
    const { videoId } = req.body;
    if (!videoId) {
      return res
        .status(400)
        .json({ success: false, message: 'videoId is required.' });
    }

    const video = await Video.findById(videoId);
    if (!video) {
      return res
        .status(404)
        .json({ success: false, message: 'Video not found.' });
    }

    if (video.status === 'processing' || video.status === 'queued') {
      return res.status(409).json({
        success: false,
        message: 'This video is already being analyzed.',
      });
    }

    const analysis = await Analysis.create({
      videoId,
      requestedBy: req.user._id,
      config: {
        confidenceThreshold: parseFloat(req.body.confidenceThreshold) || 0.4,
        iouThreshold: parseFloat(req.body.iouThreshold) || 0.45,
        frameInterval: parseInt(req.body.frameInterval) || 10,
      },
    });

    video.status = 'queued';
    video.analysisId = analysis._id;
    await video.save();

    // Dispatch to AI service asynchronously
    dispatchToAI(analysis._id, video).catch((err) => {
      console.error('[analysis] AI dispatch failed:', err.message);
    });

    res.status(202).json({
      success: true,
      message: 'Analysis queued.',
      analysis,
    });
  } catch (err) {
    next(err);
  }
};

async function dispatchToAI(analysisId, video) {
  try {
    await Analysis.findByIdAndUpdate(analysisId, { status: 'processing' });
    await Video.findByIdAndUpdate(video._id, { status: 'processing' });

    const response = await axios.post(
      `${env.aiServiceUrl}/analyze/video`,
      {
        analysis_id: analysisId.toString(),
        video_path: video.path,
        confidence_threshold: 0.4,
        iou_threshold: 0.45,
        frame_interval: 10,
      },
      { timeout: 300000 }
    );

    if (response.data && response.data.detections) {
      const detections = response.data.detections;
      const uniqueLabels = [...new Set(detections.map((d) => d.label))];
      const threatLevels = detections.map((d) => d.threatLevel || 'NONE');
      const threatPriority = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
      let highestThreat = 'NONE';
      for (const level of threatLevels) {
        if (threatPriority.indexOf(level) < threatPriority.indexOf(highestThreat)) {
          highestThreat = level;
        }
      }

      await Analysis.findByIdAndUpdate(analysisId, {
        status: 'completed',
        detections,
        summary: {
          totalDetections: detections.length,
          threatsFound: detections.filter((d) => d.threatLevel !== 'NONE').length,
          highestThreat,
          uniqueLabels,
          framesAnalyzed: response.data.frames_analyzed || 0,
          totalFrames: response.data.total_frames || 0,
        },
        processedVideoPath: response.data.processed_video || null,
        processingTimeMs: response.data.processing_time_ms || null,
      });

      await Video.findByIdAndUpdate(video._id, { status: 'completed' });
    } else {
      await Analysis.findByIdAndUpdate(analysisId, {
        status: 'completed',
        summary: {
          totalDetections: 0,
          threatsFound: 0,
          highestThreat: 'NONE',
          uniqueLabels: [],
          framesAnalyzed: 0,
          totalFrames: 0,
        },
      });
      await Video.findByIdAndUpdate(video._id, { status: 'completed' });
    }
  } catch (err) {
    await Analysis.findByIdAndUpdate(analysisId, {
      status: 'failed',
      error: err.message,
    });
    await Video.findByIdAndUpdate(video._id, { status: 'failed' });
  }
}

exports.getAnalyses = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.user.role === 'VIEWER') {
      filter.requestedBy = req.user._id;
    }

    const [analyses, total] = await Promise.all([
      Analysis.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('videoId', 'originalName filename')
        .populate('requestedBy', 'name email')
        .lean(),
      Analysis.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      analyses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getAnalysis = async (req, res, next) => {
  try {
    const analysis = await Analysis.findById(req.params.id)
      .populate('videoId', 'originalName filename size')
      .populate('requestedBy', 'name email');

    if (!analysis) {
      return res
        .status(404)
        .json({ success: false, message: 'Analysis not found.' });
    }

    res.status(200).json({ success: true, analysis });
  } catch (err) {
    next(err);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [videoCount, analysisCount, threatCounts] = await Promise.all([
      Video.countDocuments(),
      Analysis.countDocuments(),
      Analysis.aggregate([
        { $unwind: '$detections' },
        {
          $group: {
            _id: '$detections.threatLevel',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const recentAnalyses = await Analysis.find()
      .sort('-createdAt')
      .limit(5)
      .populate('videoId', 'originalName')
      .lean();

    const threats = {};
    for (const t of threatCounts) {
      threats[t._id] = t.count;
    }

    res.status(200).json({
      success: true,
      stats: {
        totalVideos: videoCount,
        totalAnalyses: analysisCount,
        threats,
        recentAnalyses,
      },
    });
  } catch (err) {
    next(err);
  }
};
