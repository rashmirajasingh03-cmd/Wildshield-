const User = require('../models/User');

/**
 * Admin-only Officer management. The admin's ONLY operational duty:
 * register and manage officer accounts. Officers are never created via a
 * public registration form or the login API.
 */

exports.listOfficers = async (req, res, next) => {
  try {
    const officers = await User.find({ role: 'officer' })
      .select('-__v -permissions')
      .sort('-createdAt');
    res.status(200).json({
      success: true,
      count: officers.length,
      officers,
    });
  } catch (err) {
    next(err);
  }
};

exports.getOfficer = async (req, res, next) => {
  try {
    const officer = await User.findOne({
      _id: req.params.id,
      role: 'officer',
    }).select('-__v -permissions');
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found.',
      });
    }
    res.status(200).json({ success: true, officer });
  } catch (err) {
    next(err);
  }
};

exports.createOfficer = async (req, res, next) => {
  try {
    const { name, username, email, password, officerId, phone } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, username and password are required.',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.',
      });
    }

    const usernameTaken = await User.findOne({
      username: String(username).trim().toLowerCase(),
    });
    if (usernameTaken) {
      return res.status(400).json({
        success: false,
        message: 'That username is already taken.',
      });
    }

    // Role is ALWAYS forced to officer — admin can never create another admin.
    const officer = await User.create({
      name: String(name).trim(),
      username: String(username).trim().toLowerCase(),
      email: email || undefined,
      password,
      officerId: officerId || undefined,
      phone: phone || undefined,
      role: 'officer',
    });

    res.status(201).json({ success: true, officer });
  } catch (err) {
    next(err);
  }
};

exports.updateOfficer = async (req, res, next) => {
  try {
    const { name, username, email, officerId, phone } = req.body;

    const officer = await User.findOne({
      _id: req.params.id,
      role: 'officer',
    });
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found.',
      });
    }

    if (username !== undefined && String(username).trim()) {
      const clean = String(username).trim().toLowerCase();
      const taken = await User.findOne({
        username: clean,
        _id: { $ne: officer._id },
      });
      if (taken) {
        return res.status(400).json({
          success: false,
          message: 'That username is already taken.',
        });
      }
      officer.username = clean;
    }

    if (name !== undefined) officer.name = String(name).trim();
    if (email !== undefined) officer.email = email || undefined;
    if (officerId !== undefined) officer.officerId = officerId || undefined;
    if (phone !== undefined) officer.phone = phone || undefined;

    await officer.save();

    res.status(200).json({ success: true, officer });
  } catch (err) {
    next(err);
  }
};

exports.resetOfficerPassword = async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.',
      });
    }

    const officer = await User.findOne({
      _id: req.params.id,
      role: 'officer',
    });
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found.',
      });
    }

    officer.password = password;
    await officer.save();

    res.status(200).json({
      success: true,
      message: `Password updated for ${officer.username}.`,
    });
  } catch (err) {
    next(err);
  }
};

exports.setOfficerActive = async (req, res, next) => {
  try {
    const { active } = req.body;

    const officer = await User.findOne({
      _id: req.params.id,
      role: 'officer',
    });
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found.',
      });
    }

    officer.active = active === true;
    await officer.save();

    res.status(200).json({
      success: true,
      message: `${officer.name} has been ${officer.active ? 'activated' : 'disabled'}.`,
      officer,
    });
  } catch (err) {
    next(err);
  }
};