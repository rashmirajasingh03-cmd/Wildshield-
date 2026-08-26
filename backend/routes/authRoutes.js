const express = require('express');
const {
  register,
  login,
  getMe,
  updateProfile,
  listUsers,
  updateUserRole,
  deactivateUser,
} = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/register', authenticate, authorize('ADMIN'), register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateProfile);

router.get('/users', authenticate, authorize('ADMIN'), listUsers);
router.patch(
  '/users/:id/role',
  authenticate,
  authorize('ADMIN'),
  updateUserRole
);
router.delete(
  '/users/:id',
  authenticate,
  authorize('ADMIN'),
  deactivateUser
);

module.exports = router;
