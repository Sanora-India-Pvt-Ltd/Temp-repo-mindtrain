const mindtrainUserService = require('../../services/MindTrain/mindtrainUser.service');
const crypto = require('crypto');

/**
 * POST /api/mindtrain/fcm-notifications/send
 * 
 * Server-side endpoint to trigger FCM notification sends (internal/admin)
 * 
 * Authentication: Required (Admin or Service Auth)
 * 
 * Request Body:
 * {
 *   "type": "scheduled_sync_trigger",
 *   "targetUsers": "all_with_active_profiles",
 *   "notificationType": "morning", // "morning" | "evening"
 *   "batchSize": 1000
 * }
 */
const sendFCMNotifications = async (req, res) => {
    try {
        // TODO: Add admin/service authentication check
        // For now, we'll allow authenticated users (should be restricted to admin/service)
        
        const { type, targetUsers, notificationType, batchSize = 1000 } = req.body || {};

        // Validate request
        if (type !== 'scheduled_sync_trigger') {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification type',
                code: 'INVALID_TYPE'
            });
        }

        if (targetUsers !== 'all_with_active_profiles') {
            return res.status(400).json({
                success: false,
                message: 'Invalid targetUsers value',
                code: 'INVALID_TARGET_USERS'
            });
        }

        if (!['morning', 'evening'].includes(notificationType)) {
            return res.status(400).json({
                success: false,
                message: 'notificationType must be "morning" or "evening"',
                code: 'INVALID_NOTIFICATION_TYPE'
            });
        }

        // Get users that need notifications
        const users = await mindtrainUserService.getUsersForNotification(
            notificationType,
            new Date(),
            15 // 15 minute window
        );

        const targetUserCount = users.length;
        const estimatedTime = Math.ceil(targetUserCount / batchSize) * 5; // 5 seconds per batch

        // Generate job ID
        const jobId = `fcm_batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        // TODO: Queue the actual FCM sending job
        // For now, we'll just return the job info
        // In production, this would queue a background job

        return res.status(202).json({
            success: true,
            message: 'Notification job queued',
            data: {
                jobId,
                targetUserCount,
                batchSize,
                estimatedTime: `${estimatedTime}s`,
                status: 'queued'
            }
        });
    } catch (error) {
        console.error('Send FCM notifications error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to queue notification job',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            code: 'FCM_SEND_ERROR'
        });
    }
};

/**
 * POST /api/mindtrain/fcm-notifications/callback
 * 
 * FCM delivery status webhook callback
 * 
 * Authentication: Required (Firebase Admin SDK)
 * 
 * Request Body:
 * {
 *   "notificationIds": ["notif_001", "notif_002"],
 *   "status": "delivered",
 *   "deliveredAt": "2025-01-29T14:00:00Z",
 *   "failedIds": ["notif_003"],
 *   "failureReason": "InvalidToken"
 * }
 */
const fcmCallback = async (req, res) => {
    try {
        // TODO: Add Firebase Admin SDK authentication check
        // For now, we'll process the callback
        
        const { notificationIds, status, deliveredAt, failedIds, failureReason } = req.body || {};

        // Validate request
        if (!notificationIds || !Array.isArray(notificationIds)) {
            return res.status(400).json({
                success: false,
                message: 'notificationIds array is required',
                code: 'MISSING_NOTIFICATION_IDS'
            });
        }

        // Update notification logs for delivered notifications
        if (notificationIds.length > 0 && status === 'delivered') {
            for (const notificationId of notificationIds) {
                await mindtrainUserService.updateNotificationLog(notificationId, {
                    status: 'delivered',
                    deliveredAt: deliveredAt ? new Date(deliveredAt) : new Date()
                });
            }
        }

        // Update notification logs for failed notifications
        if (failedIds && Array.isArray(failedIds) && failedIds.length > 0) {
            for (const notificationId of failedIds) {
                await mindtrainUserService.updateNotificationLog(notificationId, {
                    status: 'failed',
                    failedAt: new Date(),
                    deliveryError: failureReason || 'Unknown error',
                    deliveryRetries: 1 // Will be incremented by service if needed
                });
            }
        }

        // TODO: Update deviceSyncStatus in AlarmProfile
        // TODO: Update SyncHealthLog for users
        // TODO: Add failed notifications to retry queue

        return res.status(200).json({
            success: true,
            message: 'Delivery status recorded'
        });
    } catch (error) {
        console.error('FCM callback error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to process callback',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            code: 'FCM_CALLBACK_ERROR'
        });
    }
};

/**
 * POST /api/mindtrain/fcm-notifications/test
 * 
 * Test endpoint to manually trigger a broadcast notification.
 * Useful for testing WebSocket and FCM delivery.
 * 
 * Authentication: Not required (for testing purposes)
 * 
 * Request Body:
 * {
 *   "profileId": "profile_id_here", // Optional
 *   "notificationType": "morning" // "morning" | "evening"
 * }
 */
const testNotification = async (req, res) => {
    try {
        const { profileId, notificationType = 'morning' } = req.body;

        if (!['morning', 'evening'].includes(notificationType)) {
            return res.status(400).json({
                success: false,
                message: 'notificationType must be "morning" or "evening"',
                code: 'INVALID_NOTIFICATION_TYPE'
            });
        }

        console.log(`[TestNotification] Broadcasting test notification to all users`);

        // Import notification service
        const { broadcastMindTrainNotification } = require('../../services/MindTrain/mindTrainNotification.service');

        const result = await broadcastMindTrainNotification({
            profileId: profileId || null,
            notificationType: notificationType
        });

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: 'Test notification broadcasted successfully',
                data: {
                    broadcast: true,
                    profileId: profileId || null,
                    notificationType: notificationType,
                    deliveryMethod: result.deliveryMethod,
                    stats: result.stats,
                    timestamp: new Date().toISOString()
                }
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Failed to broadcast test notification',
                code: 'BROADCAST_FAILED',
                error: result.message || result.error,
                data: {
                    broadcast: true,
                    profileId: profileId || null,
                    notificationType: notificationType
                }
            });
        }

    } catch (error) {
        console.error('Test notification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send test notification',
            code: 'TEST_NOTIFICATION_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * POST /api/mindtrain/fcm-notifications/broadcast
 * 
 * Dedicated endpoint to broadcast notifications to all users.
 * Same functionality as test endpoint with broadcast: true, but cleaner API.
 * 
 * Authentication: Not required (for testing purposes)
 * 
 * Request Body:
 * {
 *   "notificationType": "morning", // "morning" | "evening"
 *   "profileId": "profile_id_here" // Optional
 * }
 */
const broadcastNotification = async (req, res) => {
    try {
        const { notificationType = 'morning', profileId = null } = req.body;

        if (!['morning', 'evening'].includes(notificationType)) {
            return res.status(400).json({
                success: false,
                message: 'notificationType must be "morning" or "evening"',
                code: 'INVALID_NOTIFICATION_TYPE'
            });
        }

        console.log(`[BroadcastNotification] Broadcasting notification to all users`);

        // Import notification service
        const { broadcastMindTrainNotification } = require('../../services/MindTrain/mindTrainNotification.service');

        const result = await broadcastMindTrainNotification({
            profileId: profileId,
            notificationType: notificationType
        });

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: 'Notification broadcasted successfully',
                data: {
                    broadcast: true,
                    profileId: profileId || null,
                    notificationType: notificationType,
                    deliveryMethod: result.deliveryMethod,
                    stats: result.stats,
                    timestamp: new Date().toISOString()
                }
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Failed to broadcast notification',
                code: 'BROADCAST_FAILED',
                error: result.message || result.error,
                data: {
                    broadcast: true,
                    profileId: profileId || null,
                    notificationType: notificationType
                }
            });
        }

    } catch (error) {
        console.error('Broadcast notification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to broadcast notification',
            code: 'BROADCAST_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    sendFCMNotifications,
    fcmCallback,
    testNotification,
    broadcastNotification
};

