const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(decoded.id);

    if (!user || !user.active) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists or is deactivated.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Token expired. Please log in again.'
        : 'Invalid token. Please log in again.';
    return res.status(401).json({ success: false, message });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource.',
      });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
