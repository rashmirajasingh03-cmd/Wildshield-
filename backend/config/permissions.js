/**
 * Role → permission matrix (single source of truth).
 * Stored on each user document (`User.permissions`) and synced from role.
 *
 * Roles: admin (officer management only) · officer (operations) ·
 * viewer (read-only reports). Usernames are lowercase on purpose so role
 * checks are case-safe.
 */
const ROLES = ['admin', 'officer', 'viewer'];

const ROLE_PERMISSIONS = {
  admin: ['auth:login', 'officers:manage'],
  officer: [
    'auth:login',
    'videos:upload',
    'videos:delete',
    'videos:view',
    'analysis:run',
    'analysis:view',
    'reports:view',
    'reports:generate',
    'reports:download',
  ],
  viewer: ['auth:login', 'reports:view', 'reports:download'],
};

function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

module.exports = { ROLES, ROLE_PERMISSIONS, permissionsForRole };