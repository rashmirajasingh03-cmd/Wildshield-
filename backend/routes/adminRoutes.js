const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  listOfficers,
  getOfficer,
  createOfficer,
  updateOfficer,
  resetOfficerPassword,
  setOfficerActive,
} = require('../controllers/adminController');

const router = express.Router();

// Every route below is ADMIN-ONLY. Viewers and officers are rejected by the
// role guard regardless of how the URL is called.
router.use(authenticate, requireRole('admin'));

router.get('/officers', listOfficers);
router.get('/officers/:id', getOfficer);
router.post('/officers', createOfficer);
router.patch('/officers/:id', updateOfficer);
router.patch('/officers/:id/password', resetOfficerPassword);
router.patch('/officers/:id/status', setOfficerActive);

module.exports = router;