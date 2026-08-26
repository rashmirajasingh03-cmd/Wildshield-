const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');

function signToken(id) {
  return jwt.sign({ id }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function sendToken(res, user, statusCode) {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user,
  });
}

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const user = await User.create({ name, email, password, role });
    sendToken(res, user, 201);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    const user = await User.findOne({ email, active: true }).select(
      '+password'
    );

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    sendToken(res, user, 200);
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
    const allowed = ['name'];
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

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-__v').sort('-createdAt');
    res.status(200).json({ success: true, count: users.length, users });
  } catch (err) {
    next(err);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const { id } = req.params;

    if (!['ADMIN', 'FOREST_OFFICIAL', 'VIEWER'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role.',
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

exports.deactivateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${user.name} has been deactivated.`,
    });
  } catch (err) {
    next(err);
  }
};
