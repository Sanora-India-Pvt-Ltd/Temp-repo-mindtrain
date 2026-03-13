const express = require('express');
const { protect } = require('../../middleware/auth');
const { syncHealth, syncStatus } = require('../../controllers/MindTrain/syncHealth.controller');

const router = express.Router();

/**
 * PUT /api/mindtrain/alarm-profiles/sync-health
 * Client reports sync health status to backend
 */
router.put('/sync-health', protect, syncHealth);

/**
 * GET /api/mindtrain/alarm-profiles/sync-status
 * Client checks if server has any pending sync/recovery actions
 */
router.get('/sync-status', protect, syncStatus);

module.exports = router;

