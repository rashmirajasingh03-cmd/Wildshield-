const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  uploadMiddleware,
  uploadVideo,
  getVideos,
  getVideo,
  deleteVideo,
} = require('../controllers/videoController');

const router = express.Router();

router.use(authenticate);

router.post('/', authorize('ADMIN', 'FOREST_OFFICIAL'), uploadMiddleware, uploadVideo);
router.get('/', getVideos);
router.get('/:id', getVideo);
router.delete('/:id', authorize('ADMIN', 'FOREST_OFFICIAL'), deleteVideo);

module.exports = router;
