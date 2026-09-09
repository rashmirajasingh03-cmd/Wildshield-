const express = require('express');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const {
  uploadMiddleware,
  uploadVideo,
  getVideos,
  getVideo,
  deleteVideo,
} = require('../controllers/videoController');

const router = express.Router();

// Video operations are OFFICER-only (AI operations). Admins manage officers,
// viewers have read-only report access — neither touches video storage.
router.use(authenticate, requireRole('officer'));

router.post('/', requirePermission('videos:upload'), uploadMiddleware, uploadVideo);
router.get('/', getVideos);
router.get('/:id', getVideo);
router.delete('/:id', requirePermission('videos:delete'), deleteVideo);

module.exports = router;