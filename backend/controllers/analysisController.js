const axios = require('axios');
const Analysis = require('../models/Analysis');
const Video = require('../models/Video');
const env = require('../config/env');

exports.startAnalysis = async (req, res, next) => {
  try {
    const videoId =
      (req.body && (req.body.videoId || req.body._id)) || req.params.videoId;
    if (!videoId) {
      return res.status(400).json({
        success: false,
        message:
          'videoId is required. Upload a video first, then start the analysis from the upload page.',
      });
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
    dispatchToAI(analysis._id, video, analysis.config).catch((err) => {
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

async function dispatchToAI(analysisId, video, config) {
  const Analysis = require('../models/Analysis');
  try {
    await Analysis.findByIdAndUpdate(analysisId, { status: 'processing' });
    await Video.findByIdAndUpdate(video._id, { status: 'processing' });

    const thresholds = config || {
      confidenceThreshold: 0.4,
      iouThreshold: 0.45,
      frameInterval: 10,
    };

    const response = await axios.post(
      `${env.aiServiceUrl}/analyze/video`,
      {
        analysis_id: analysisId.toString(),
        video_path: video.path,
        confidence_threshold: thresholds.confidenceThreshold,
        iou_threshold: thresholds.iouThreshold,
        frame_interval: thresholds.frameInterval,
      },
      { timeout: 300000 }
    );

    if (response.status === 200 && response.data) {
      const result = response.data.result || {};
      const verdict = result.verdict === 'ANIMAL_HARM_DETECTED' ? 'ANIMAL_HARM_DETECTED' : 'NO_THREAT';

      // VideoMAE temporal-action fusion fields (may be absent when the
      // classifier is unavailable or running in pretrained/model-development mode).
      const videomae = {
        loaded: !!(result.videomae && result.videomae.loaded),
        mode: (result.videomae && result.videomae.mode) || 'not_loaded',
        classification: result.classification || null,
        threat_level: result.threat_level || null,
        confidence: result.confidence || 0,
        action_class: result.action_class || null,
        action_confidence: result.action_confidence || 0,
        action_supported: !!result.action_supported,
        weapon_detected: !!result.weapon_detected,
        person_detected: !!result.person_detected,
        animals_detected: result.animals_detected || [],
        detected_objects: result.detected_objects || [],
        reason: result.reason || null,
        limitation:
          (result.videomae && result.videomae.limitation) || null,
      };

      await Analysis.findByIdAndUpdate(analysisId, {
        status: 'completed',
        threatResult: {
          verdict,
          message: result.message || null,
          incident: result.incident || null,
          incidents_count: result.incidents_count || 0,
        },
        videomae,
        summary: {
          totalDetections: 0,
          threatsFound: verdict === 'ANIMAL_HARM_DETECTED' ? 1 : 0,
          highestThreat: verdict === 'ANIMAL_HARM_DETECTED' ? 'HIGH' : 'NONE',
          uniqueLabels: [],
          framesAnalyzed: response.data.frames_analyzed || 0,
          totalFrames: response.data.total_frames || 0,
        },
        processedVideoPath: response.data.processed_video || null,
        processingTimeMs: response.data.processing_time_ms || null,
        error: null,
      });

      await Video.findByIdAndUpdate(video._id, { status: 'completed' });
    } else {
      throw new Error('Unexpected AI service response.');
    }
  } catch (err) {
    const message =
      err.response && err.response.data && err.response.data.detail
        ? err.response.data.detail
        : err.message;
    await Analysis.findByIdAndUpdate(analysisId, {
      status: 'failed',
      error: message,
      threatResult: {
        verdict: 'NO_THREAT',
        message: 'Analysis failed.',
        incident: null,
        incidents_count: 0,
      },
      summary: {
        totalDetections: 0,
        threatsFound: 0,
        highestThreat: 'NONE',
        uniqueLabels: [],
        framesAnalyzed: 0,
        totalFrames: 0,
      },
    });
    await Video.findByIdAndUpdate(video._id, { status: 'failed' });
  }
}

function stripDetections(doc) {
  const obj = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  if (obj) {
    delete obj.detections;
    if (obj.summary) {
      delete obj.summary.uniqueLabels;
    }
  }
  return obj;
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
      analyses: (analyses || []).map((a) => stripDetections(a)),
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

    res.status(200).json({ success: true, analysis: stripDetections(analysis) });
  } catch (err) {
    next(err);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [videoCount, analysisCount, harmCount, noThreatCount] = await Promise.all([
      Video.countDocuments(),
      Analysis.countDocuments(),
      Analysis.countDocuments({ 'threatResult.verdict': 'ANIMAL_HARM_DETECTED' }),
      Analysis.countDocuments({ 'threatResult.verdict': 'NO_THREAT', status: 'completed' }),
    ]);

    const recentAnalyses = await Analysis.find()
      .sort('-createdAt')
      .limit(5)
      .populate('videoId', 'originalName')
      .lean();

    res.status(200).json({
      success: true,
      stats: {
        totalVideos: videoCount,
        totalAnalyses: analysisCount,
        harmDetectedCount: harmCount,
        noThreatCount,
        recentAnalyses: (recentAnalyses || []).map((a) => stripDetections(a)),
      },
    });
  } catch (err) {
    next(err);
  }
};
