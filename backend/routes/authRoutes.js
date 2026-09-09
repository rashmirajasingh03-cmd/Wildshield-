const express = require('express');
const {
  login,
  viewerLogin,
  getMe,
  updateProfile,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Admin (username/email + password) and Officer (username/email + password)
router.post('/login', login);

// Viewer: username only, no password, no registration
router.post('/viewer-login', viewerLogin);

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateProfile);

module.exports = router;