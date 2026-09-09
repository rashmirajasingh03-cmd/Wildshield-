/**
 * One-time migration: backfill `permissions` on existing user documents from
 * their role. Run once:  node scripts/backfill-permissions.js
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const env = require('../config/env');
const { permissionsForRole } = require('../config/permissions');

async function migrate() {
  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('Connected to MongoDB');

  const users = await User.find();
  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    const expected = permissionsForRole(user.role);
    const same =
      Array.isArray(user.permissions) &&
      user.permissions.length === expected.length &&
      expected.every((p) => user.permissions.includes(p));

    if (same) {
      skipped += 1;
      continue;
    }

    user.permissions = expected;
    await user.save();
    updated += 1;
    console.log(`Updated ${user.email} (${user.role}): [${expected.join(', ')}]`);
  }

  console.log(`\nMigration complete: ${updated} updated, ${skipped} already correct.`);
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});