const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const BASE_UPLOAD_DIR = path.resolve(env.uploadDir);

const DIRS = {
  videos: path.join(BASE_UPLOAD_DIR, 'videos'),
  processed: path.join(BASE_UPLOAD_DIR, 'processed'),
  snapshots: path.join(BASE_UPLOAD_DIR, 'snapshots'),
  reports: path.join(BASE_UPLOAD_DIR, 'reports'),
};

function ensureDirectories() {
  for (const dir of Object.values(DIRS)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function getDir(key) {
  ensureDirectories();
  return DIRS[key];
}

function getFilePath(key, filename) {
  return path.join(getDir(key), filename);
}

function deleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // ignore cleanup errors
  }
}

module.exports = { ensureDirectories, getDir, getFilePath, deleteFile, DIRS };
