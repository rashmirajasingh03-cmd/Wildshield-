const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const { permissionsForRole } = require('../config/permissions');

function signToken(id, role) {
  return jwt.sign({ id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function sendToken(res, user, statusCode) {
  const token = signToken(user._id, user.role);
  res.status(statusCode).json({
    success: true,
    token,
    user,
  });
}

/**
 * Find an account whose username OR email matches the given identifier.
 */
async function findByIdentifier(identifier) {
  if (!identifier || !identifier.trim()) return null;
  const value = identifier.trim().toLowerCase();
  return User.findOne({
    $or: [{ username: value }, { email: value }],
  }).select('+password');
}

function ensurePermissions(user) {
  if (!Array.isArray(user.permissions) || user.permissions.length === 0) {
    user.permissions = permissionsForRole(user.role);
  }
  return user;
}

/**
 * Admin / Officer login. Credentials are username or email + password.
 * The role is NEVER taken from the request body — it is resolved from the
 * stored account, so a frontend cannot self-assign or escalate a role.
 */
exports.login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username/email and password.',
      });
    }

    const user = await findByIdentifier(identifier);
    if (!user || !user.active || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    if (user.role === 'viewer') {
      return res.status(403).json({
        success: false,
        message: 'Viewers log in with username only. Use the Viewer login.',
      });
    }

    sendToken(res, ensurePermissions(user), 200);
  } catch (err) {
    next(err);
  }
};

/**
 * Viewer login — username ONLY, no password, no prior registration.
 * A username belonging to an admin/officer account is rejected so viewers
 * cannot take over another role's login.
 */
exports.viewerLogin = async (req, res, next) => {
  try {
    const { username } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a username.',
      });
    }

    const clean = username.trim().toLowerCase();

    const existing = await User.findOne({ username: clean }).select('+password');
    if (existing) {
      if (existing.role !== 'viewer') {
        return res.status(403).json({
          success: false,
          message: 'This username belongs to a privileged account and cannot be used for Viewer access.',
        });
      }
      if (!existing.active) {
        return res.status(403).json({
          success: false,
          message: 'This viewer account is disabled.',
        });
      }
      return sendToken(res, ensurePermissions(existing), 200);
    }

    // Passwordless access: store a random, unusable hash (never checked).
    const viewer = await User.create({
      name: clean,
      username: clean,
      password: crypto.randomBytes(24).toString('hex'),
      role: 'viewer',
    });

    sendToken(res, viewer, 200);
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
};

exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
};