/**
 * Seed script: creates the SINGLE admin account and one sample officer.
 * There is exactly ONE admin in the system; the seed is idempotent and will
 * never create a second admin. Viewers do not need seeding (username-only).
 * Run once:  node scripts/seed-admin.js   (or: npm run seed)
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const env = require('../config/env');

const SAMPLE_USERS = [
  {
    name: 'System Administrator',
    username: 'admin',
    email: 'admin@wildshield.gov',
    password: 'WildShield@2026',
    role: 'admin',
  },
  {
    name: 'Ranger R. Silva',
    username: 'officer',
    email: 'officer@wildshield.gov',
    password: 'Officer@2026',
    officerId: 'WS-1001',
    phone: '+94 77 000 1001',
    role: 'officer',
  },
];

async function seed() {
  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('Connected to MongoDB');

  for (const account of SAMPLE_USERS) {
    const exists = await User.findOne({ username: account.username });
    if (exists) {
      console.log(`User ${account.role} already exists (${account.username}). Skipping.`);
    } else {
      await User.create(account);
      console.log(`Created ${account.role}: ${account.username}`);
    }
  }

  console.log('\nSeed complete. Change passwords after first login!');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});