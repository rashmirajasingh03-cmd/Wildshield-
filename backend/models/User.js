const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, permissionsForRole } = require('../config/permissions');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    officerId: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'viewer',
    },
    permissions: {
      type: [String],
      default: undefined,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  this.permissions = permissionsForRole(this.role);

  // There can be exactly ONE admin account in the whole system.
  if (this.role === 'admin') {
    const existingAdmin = await this.constructor.countDocuments({
      role: 'admin',
      _id: { $ne: this._id },
    });
    if (existingAdmin > 0) {
      return next(new Error('Only one admin account is allowed.'));
    }
  }

  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
