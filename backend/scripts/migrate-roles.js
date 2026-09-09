/**
 * One-time migration: move existing accounts to the new role model.
 *   ADMIN          -> admin
 *   FOREST_OFFICIAL-> officer
 *   VIEWER         -> viewer
 * Adds unique `username`, optional email (drops the old unique email index so
 * multiple officers may share no email), and stores officer fields.
 * Run once:  node scripts/migrate-roles.js
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const env = require('../config/env');

const ROLE_MAP = {
  ADMIN: 'admin',
  FOREST_OFFICIAL: 'officer',
  VIEWER: 'viewer',
};

function toUsername(email, name, role) {
  let base = (email || '').split('@')[0].toLowerCase() || '';
  if (!base) base = (name || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '') || '';
  if (!base) base = role;
  return base;
}

async function migrate() {
  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('Connected to MongoDB');

  // Drop the old unique email index so email can become optional.
  try {
    await mongoose.connection.collection('users').dropIndex('email_1');
    console.log('Dropped old unique index on email.');
  } catch (e) {
    console.log('No unique email index to drop (or already dropped).');
  }

  const users = await User.find();
  let updated = 0;
  let skipped = 0;

  const usernames = new Set();

  for (const user of users) {
    const newRole = ROLE_MAP[user.role];
    if (!newRole) {
      console.log(`SKIP ${user.email || user.name}: unknown role "${user.role}"`);
      continue;
    }

    let username = user.username || toUsername(user.email, user.name, newRole);
    let suffix = '';
    let i = 2;
    while (usernames.has(username + suffix)) {
      suffix = `${i++}`;
    }
    if (suffix) username = username + suffix;
    usernames.add(username);

    user.username = username;
    user.role = newRole;
    await user.save(); // pre-save hook re-syncs permissions
    updated += 1;
    console.log(`Updated ${user.email || user.name} -> ${newRole} / @${username}`);
  }

  console.log(`\nMigration complete: ${updated} updated, ${skipped} skipped.`);
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});