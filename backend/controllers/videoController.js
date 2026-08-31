const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const Video = require('../models/Video');
const env = require('../config/env');
const { getFilePath, getDir } = require('../services/storage');

const ALLOWED_MIMES = [
  'video/mp4',
  'video/avi',
  'video/x-msvideo',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-flv',
  'video/x-ms-wmv',
];

const ALLOWED_EXTS = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getDir('videos'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = crypto.randomUUID();
    cb(null, `vid_${Date.now()}_${unique}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return cb(
      new Error(
        `Invalid file type "${ext}". Allowed: ${ALLOWED_EXTS.join(', ')}`
      ),
      false
    );
  }
  if (!ALLOWED_MIMES.includes(file.mimetype) && !file.mimetype.startsWith('video/')) {
    return cb(new Error('Only video files are allowed.'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxFileSizeMb * 1024 * 1024 },
}).single('video');

exports.uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `File exceeds maximum size of ${env.maxFileSizeMb}MB.`
        : err.message;
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'No video file provided.' });
    }
    next();
  });
};

exports.uploadVideo = async (req, res, next) => {
  try {
    const { tags, notes } = req.body;
    const video = await Video.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      uploadedBy: req.user._id,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      notes: notes || '',
    });

    res.status(201).json({
      success: true,
      video,
      videoId: video._id,
    });
  } catch (err) {
    next(err);
  }
};

exports.getVideos = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.user.role === 'VIEWER') {
      filter.uploadedBy = req.user._id;
    }

    const [videos, total] = await Promise.all([
      Video.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name email')
        .lean(),
      Video.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      videos,
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

exports.getVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('uploadedBy', 'name email')
      .populate('analysisId');

    if (!video) {
      return res
        .status(404)
        .json({ success: false, message: 'Video not found.' });
    }

    res.status(200).json({ success: true, video });
  } catch (err) {
    next(err);
  }
};

exports.deleteVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res
        .status(404)
        .json({ success: false, message: 'Video not found.' });
    }

    if (
      video.uploadedBy.toString() !== req.user._id.toString() &&
      req.user.role !== 'ADMIN'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this video.',
      });
    }

    const { deleteFile } = require('../services/storage');
    deleteFile(video.path);

    await Video.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Video deleted.',
    });
  } catch (err) {
    next(err);
  }
};
