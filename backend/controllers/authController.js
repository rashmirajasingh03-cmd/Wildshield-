/**
 * Auth controller stub.
 * Real authentication (bcrypt + JWT + roles) is implemented in Phase 3.
 * Until then every auth endpoint responds with a clear 501 so the
 * frontend login page can show an honest message instead of failing silently.
 */
async function loginStub(req, res) {
  res.status(501).json({
    success: false,
    phase: 3,
    message:
      'Authentication is not implemented yet. It arrives in Phase 3 of the build plan.',
  });
}

async function meStub(req, res) {
  res.status(501).json({
    success: false,
    phase: 3,
    message: 'GET /api/auth/me will be available in Phase 3.',
  });
}

async function logoutStub(req, res) {
  res.status(501).json({
    success: false,
    phase: 3,
    message: 'POST /api/auth/logout will be available in Phase 3.',
  });
}

module.exports = { loginStub, meStub, logoutStub };
