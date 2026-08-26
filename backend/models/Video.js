const mongoose = require('mongoose');

const VIDEO_STATUSES = ['uploaded', 'queued', 'processing', 'completed', 'failed'];
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'];

const videoSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    duration: { type: Number, default: null },
    path: { type: String, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: VIDEO_STATUSES,
      default: 'uploaded',
    },
    analysisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Analysis',
      default: null,
    },
    tags: [{ type: String, trim: true }],
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

videoSchema.index({ uploadedBy: 1, createdAt: -1 });
videoSchema.index({ status: 1 });

videoSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Video', videoSchema);
module.exports.VIDEO_STATUSES = VIDEO_STATUSES;
module.exports.VIDEO_EXTENSIONS = VIDEO_EXTENSIONS;
