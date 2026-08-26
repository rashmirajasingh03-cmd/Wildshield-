const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    analysisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Analysis',
      required: true,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    filename: { type: String, required: true },
    path: { type: String, required: true },
    format: { type: String, enum: ['pdf'], default: 'pdf' },
    fileSize: { type: Number, default: 0 },
  },
  { timestamps: true }
);

reportSchema.index({ analysisId: 1 });

module.exports = mongoose.model('Report', reportSchema);
