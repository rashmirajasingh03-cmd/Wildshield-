const express = require('express');
const { loginStub, meStub, logoutStub } = require('../controllers/authController');

const router = express.Router();

// Placeholder endpoints - replaced by real JWT auth in Phase 3
router.post('/login', loginStub);
router.get('/me', meStub);
router.post('/logout', logoutStub);

module.exports = router;
