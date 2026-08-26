/**
 * Seed script: creates the initial admin user.
 * Run once:  node scripts/seed-admin.js
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const env = require('../config/env');

const ADMIN = {
  name: 'System Administrator',
  email: 'admin@wildshield.gov',
  password: 'WildShield@2026',
  role: 'ADMIN',
};

async function seed() {
  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('Connected to MongoDB');

  const exists = await User.findOne({ email: ADMIN.email });
  if (exists) {
    console.log(`Admin user already exists (${ADMIN.email}). Skipping.`);
  } else {
    await User.create(ADMIN);
    console.log(`Admin user created: ${ADMIN.email}`);
    console.log('Change the default password after first login!');
  }

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
