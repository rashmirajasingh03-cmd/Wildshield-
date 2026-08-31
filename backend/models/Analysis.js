const mongoose = require('mongoose');

const ANALYSIS_STATUSES = ['queued', 'processing', 'completed', 'failed'];

const detectionSchema = new mongoose.Schema(
  {
    frameIndex: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    label: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    bbox: {
      x1: Number,
      y1: Number,
      x2: Number,
      y2: Number,
    },
    threatLevel: {
      type: String,
      enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'NONE',
    },
    threatCategory: { type: String, default: null },
    snapshotPath: { type: String, default: null },
  },
  { _id: true }
);

const analysisSchema = new mongoose.Schema(
  {
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ANALYSIS_STATUSES,
      default: 'queued',
    },
    detections: [detectionSchema],
    threatResult: {
      verdict: {
        type: String,
        enum: ['NO_THREAT', 'ANIMAL_HARM_DETECTED'],
        default: 'NO_THREAT',
      },
      message: { type: String, default: null },
      incident: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      incidents_count: { type: Number, default: 0 },
    },
    // VideoMAE fusion metadata from the AI service (Action / Threat level /
    // temporal analysis). Stored separately so the legacy verdict rendering
    // above stays untouched.
    videomae: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    summary: {
      totalDetections: { type: Number, default: 0 },
      threatsFound: { type: Number, default: 0 },
      highestThreat: {
        type: String,
        enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'NONE',
      },
      uniqueLabels: [{ type: String }],
      framesAnalyzed: { type: Number, default: 0 },
      totalFrames: { type: Number, default: 0 },
    },
    processedVideoPath: { type: String, default: null },
    reportPath: { type: String, default: null },
    error: { type: String, default: null },
    processingTimeMs: { type: Number, default: null },
    config: {
      confidenceThreshold: { type: Number, default: 0.4 },
      iouThreshold: { type: Number, default: 0.45 },
      frameInterval: { type: Number, default: 10 },
    },
  },
  { timestamps: true }
);

analysisSchema.index({ videoId: 1 });
analysisSchema.index({ requestedBy: 1, createdAt: -1 });
analysisSchema.index({ status: 1 });

analysisSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Analysis', analysisSchema);
module.exports.ANALYSIS_STATUSES = ANALYSIS_STATUSES;
