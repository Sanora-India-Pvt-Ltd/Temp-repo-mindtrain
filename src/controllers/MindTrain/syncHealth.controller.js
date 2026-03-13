const syncHealthService = require('../../services/MindTrain/syncHealthService');

/**
 * PUT /api/mindtrain/alarm-profiles/sync-health
 * 
 * Client reports sync health status to backend
 * 
 * Authentication: Required (JWT)
 * 
 * Request Body:
 * {
 *   "deviceId": "...",
 *   "deviceState": { ... },
 *   "syncMetrics": { ... }
 * }
 */
const syncHealth = async (req, res) => {
    try {
        // Validate authentication
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const { deviceId, deviceState, syncMetrics } = req.body || {};

        // Validate required fields
        if (!deviceId) {
            return res.status(400).json({
                success: false,
                message: 'deviceId is required',
                code: 'MISSING_DEVICE_ID'
            });
        }

        if (!syncMetrics) {
            return res.status(400).json({
                success: false,
                message: 'syncMetrics is required',
                code: 'MISSING_SYNC_METRICS'
            });
        }

        // Record sync health
        const healthResult = await syncHealthService.recordSyncHealth({
            userId: req.userId,
            deviceId,
            deviceState: deviceState || {},
            syncMetrics
        });

        // Calculate next sync check time (24 hours from now)
        const nextSyncCheckTime = new Date();
        nextSyncCheckTime.setHours(nextSyncCheckTime.getHours() + 24);

        // Prepare response
        const response = {
            success: true,
            message: 'Sync health recorded',
            data: {
                healthScore: healthResult.healthScore,
                status: healthResult.status,
                recommendations: healthResult.recommendations,
                nextSyncCheckTime: nextSyncCheckTime.toISOString()
            }
        };

        return res.status(200).json(response);
    } catch (error) {
        console.error('Sync health error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to record sync health',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            code: 'SYNC_HEALTH_ERROR'
        });
    }
};

/**
 * GET /api/mindtrain/alarm-profiles/sync-status
 * 
 * Client checks if server has any pending sync/recovery actions
 * 
 * Authentication: Required (JWT)
 * 
 * Query Parameters:
 * - deviceId (required)
 * - lastSyncTime (optional)
 */
const syncStatus = async (req, res) => {
    try {
        // Validate authentication
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const { deviceId, lastSyncTime } = req.query || {};

        // Validate required query parameters
        if (!deviceId) {
            return res.status(400).json({
                success: false,
                message: 'deviceId query parameter is required',
                code: 'MISSING_DEVICE_ID'
            });
        }

        // Get user's active profile and FCM schedule
        const mindtrainUserService = require('../../services/MindTrain/mindtrainUser.service');
        
        let user = await mindtrainUserService.getMindTrainUser(req.userId);
        if (!user) {
            user = await mindtrainUserService.createMindTrainUser(req.userId);
        }

        // Get active profile from nested array
        const activeProfile = user.alarmProfiles?.find(p => p.isActive === true) || null;
        const fcmSchedule = user.fcmSchedule || null;

        // Detect sync patterns
        const patterns = await syncHealthService.detectSyncPatterns(req.userId);

        // Check if profile was updated since lastSyncTime
        let needsSync = false;
        let reason = null;
        const profileChanges = [];
        const recoveryActions = [];

        if (lastSyncTime) {
            const lastSyncDate = new Date(lastSyncTime);
            
            if (activeProfile) {
                const profileUpdatedAt = activeProfile.updatedAt 
                    ? (activeProfile.updatedAt.toISOString ? new Date(activeProfile.updatedAt) : new Date(activeProfile.updatedAt))
                    : null;
                
                if (profileUpdatedAt && profileUpdatedAt > lastSyncDate) {
                    needsSync = true;
                    reason = 'Profile updated on server';
                    
                    // Determine which fields changed (simplified - in production, track field-level changes)
                    profileChanges.push({
                        id: activeProfile.id,
                        action: 'updated',
                        fields: ['profile'],
                        changedAt: profileUpdatedAt.toISOString()
                    });
                }
            }
        } else {
            // If no lastSyncTime, assume sync is needed
            needsSync = true;
            reason = 'Initial sync required';
        }

        // Check for recovery actions based on sync patterns
        if (patterns.issues.length > 0) {
            if (patterns.issues.some(issue => issue.includes('completely failing'))) {
                recoveryActions.push({
                    type: 'resync_profile',
                    profileId: activeProfile?.id || null,
                    reason: 'Server detected client sync failures'
                });
            }
        }

        // Prepare FCM schedule update if schedule exists
        let fcmScheduleUpdate = null;
        if (fcmSchedule && lastSyncTime) {
            const lastSyncDate = new Date(lastSyncTime);
            const scheduleUpdatedAt = fcmSchedule.updatedAt 
                ? (fcmSchedule.updatedAt.toISOString ? new Date(fcmSchedule.updatedAt) : new Date(fcmSchedule.updatedAt))
                : null;
            
            if (scheduleUpdatedAt && scheduleUpdatedAt > lastSyncDate) {
                fcmScheduleUpdate = {
                    morningNotificationTime: fcmSchedule.morningNotificationTime,
                    eveningNotificationTime: fcmSchedule.eveningNotificationTime,
                    timezone: fcmSchedule.timezone
                };
            }
        }

        // Prepare response
        const response = {
            success: true,
            message: 'Sync status retrieved',
            data: {
                needsSync,
                reason: reason || (needsSync ? 'Sync check required' : 'No sync needed'),
                profileChanges: profileChanges.length > 0 ? profileChanges : [],
                fcmScheduleUpdate,
                recoveryActions
            }
        };

        return res.status(200).json(response);
    } catch (error) {
        console.error('Sync status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve sync status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            code: 'SYNC_STATUS_ERROR'
        });
    }
};

module.exports = {
    syncHealth,
    syncStatus
};

