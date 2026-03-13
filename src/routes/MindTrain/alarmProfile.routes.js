const express = require('express');
const { protect } = require('../../middleware/auth');
const { createAlarmProfile, getAlarmProfiles, activateAlarmProfile, deleteAlarmProfile } = require('../../controllers/MindTrain/alarmProfile.controller');

const router = express.Router();

/**
 * POST /api/mindtrain/create-alarm-profile
 * Creates a new alarm profile and automatically deactivates all other profiles for the same user.
 */
router.post('/create-alarm-profile', protect, createAlarmProfile);

/**
 * GET /api/mindtrain/get-alarm-profiles
 * Retrieves all alarm profiles for the authenticated user, separated into active and inactive profiles.
 */
router.get('/get-alarm-profiles', protect, getAlarmProfiles);

/**
 * POST /api/mindtrain/activate-alarm-profile
 * Activates an existing alarm profile and automatically deactivates all other profiles for the same user.
 * Updates FCM schedule to enable notifications for the activated profile.
 */
router.post('/activate-alarm-profile', protect, activateAlarmProfile);

/**
 * DELETE /api/mindtrain/alarm-profiles/:profileId
 * Deletes an alarm profile and performs cascade cleanup (FCM schedule, notification logs).
 * Handles active profile transition automatically.
 */
router.delete('/alarm-profiles/:profileId', protect, deleteAlarmProfile);

module.exports = router;

