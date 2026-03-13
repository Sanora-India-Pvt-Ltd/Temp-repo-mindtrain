const { getIO } = require('../../socket/socketServer');
const { sendPushNotification } = require('../notification/pushNotification.service');
const User = require('../../models/authorization/User');

/**
 * MindTrain Notification Service
 * 
 * Broadcast notification system via Socket.IO and FCM Push:
 * - Real-time delivery to all connected users via Socket.IO (IN_APP)
 * - Push notifications to all users via FCM (PUSH)
 * - No database notification records (broadcast only)
 * 
 * Emits custom mindtrain:sync_notification and unified notification events.
 */

/**
 * Send MindTrain sync notification to ALL users (broadcast)
 * 
 * @param {Object} params
 * @param {string} params.profileId - Active alarm profile ID (optional for broadcast)
 * @param {string} params.notificationType - 'morning' | 'evening'
 * @param {string} params.scheduleId - FCM schedule ID (optional)
 * 
 * @returns {Promise<Object>} Result with delivery method and status
 */
const broadcastMindTrainNotification = async ({ profileId = null, notificationType, scheduleId = null }) => {
    try {
        // Validate inputs
        if (!notificationType) {
            throw new Error('notificationType is required');
        }

        if (!['morning', 'evening'].includes(notificationType)) {
            throw new Error('notificationType must be "morning" or "evening"');
        }

        // Prepare notification message
        const title = 'MindTrain Sync';
        const message = `Checking alarm schedule (${notificationType})`;

        // Prepare notification payload data
        const notificationPayload = {
            profileId: profileId,
            notificationType: notificationType,
            scheduleId: scheduleId,
            timestamp: new Date().toISOString(),
            syncSource: 'fcm',
            broadcast: true
        };

        // Broadcast via Socket.IO to all connected users
        let socketBroadcastCount = 0;
        try {
            const io = getIO();
            if (io) {
                // Broadcast to all connected sockets
                io.emit('mindtrain:sync_notification', {
                    ...notificationPayload,
                    title: title,
                    body: message
                });
                
                // Also broadcast unified notification event to all
                io.emit('notification', {
                    id: `broadcast_${Date.now()}`,
                    title: title,
                    message: message,
                    category: 'MINDTRAIN',
                    type: 'MINDTRAIN_SYNC_TRIGGER',
                    createdAt: new Date(),
                    entity: profileId ? {
                        type: 'ALARM_PROFILE',
                        id: profileId
                    } : null,
                    payload: notificationPayload,
                    broadcast: true
                });

                // Get count of connected sockets (approximate)
                const sockets = await io.fetchSockets();
                socketBroadcastCount = sockets.length;
                
                console.log(`[MindTrainNotification] 📢 Broadcasted to ${socketBroadcastCount} connected sockets`);
            }
        } catch (socketError) {
            console.warn('[MindTrainNotification] Failed to broadcast socket event:', socketError);
        }

        // Send FCM push notifications to all users
        let pushProcessedCount = 0;
        let pushFailedCount = 0;
        const batchSize = 500;

        try {
            // Check if User model is available and database is connected
            if (!User) {
                console.warn('[MindTrainNotification] User model not available, skipping push notifications');
            } else {
                // Get all users in batches
                let userSkip = 0;
                let hasMoreUsers = true;

                while (hasMoreUsers) {
                    const users = await User.find({})
                        .select('_id')
                        .skip(userSkip)
                        .limit(batchSize)
                        .lean();

                if (users.length === 0) {
                    hasMoreUsers = false;
                } else {
                    // Process batch in parallel
                    const batchPromises = users.map(async (user) => {
                        try {
                            const pushResult = await sendPushNotification({
                                recipientId: user._id,
                                recipientType: 'USER',
                                title: title,
                                body: message,
                                data: {
                                    category: 'MINDTRAIN',
                                    type: 'MINDTRAIN_SYNC_TRIGGER',
                                    ...notificationPayload
                                }
                            });

                            if (pushResult.success && pushResult.sentCount > 0) {
                                return { success: true };
                            } else {
                                return { success: false, reason: pushResult.reason || 'No tokens' };
                            }
                        } catch (error) {
                            console.error(`[MindTrainNotification] Push failed for user ${user._id}:`, error.message);
                            return { success: false, error: error.message };
                        }
                    });

                    const batchResults = await Promise.all(batchPromises);
                    batchResults.forEach(result => {
                        if (result.success) {
                            pushProcessedCount++;
                        } else {
                            pushFailedCount++;
                        }
                    });

                    userSkip += batchSize;
                    if (users.length < batchSize) {
                        hasMoreUsers = false;
                    }
                }
                }
            }

            console.log(`[MindTrainNotification] 📦 Push notifications: ${pushProcessedCount} sent, ${pushFailedCount} failed`);
        } catch (pushError) {
            console.error('[MindTrainNotification] Failed to send push notifications:', pushError);
        }

        console.log(`[MindTrainNotification] ✅ Broadcast completed: ${socketBroadcastCount} sockets, ${pushProcessedCount} push notifications`);

        return {
            success: true,
            deliveryMethod: 'broadcast',
            message: 'Notification broadcasted to all users',
            channels: ['IN_APP', 'PUSH'],
            stats: {
                socketBroadcastCount,
                pushProcessedCount,
                pushFailedCount
            }
        };

    } catch (error) {
        console.error('[MindTrainNotification] Broadcast error:', error);
        console.error('[MindTrainNotification] Error stack:', error.stack);
        console.error('[MindTrainNotification] Error details:', {
            message: error.message,
            name: error.name,
            code: error.code
        });
        return {
            success: false,
            deliveryMethod: 'none',
            message: 'Broadcast failed',
            error: error.message
        };
    }
};

/**
 * Send MindTrain sync notification to specific users (targeted)
 * Only sends to users whose scheduled time matches current time
 * Updates lastSentAt tracking after successful send
 * 
 * @param {Array} users - Array of user documents from getUsersForNotification
 * @param {string} notificationType - 'morning' | 'evening'
 * @returns {Promise<Object>} Result with delivery stats
 */
const sendTargetedMindTrainNotification = async (users, notificationType) => {
    const mindtrainUserService = require('./mindtrainUser.service');
    const { getIO } = require('../../socket/socketServer');
    const { sendPushNotification } = require('../notification/pushNotification.service');
    
    try {
        // Validate inputs
        if (!Array.isArray(users)) {
            throw new Error('users must be an array');
        }
        
        if (!['morning', 'evening'].includes(notificationType)) {
            throw new Error('notificationType must be "morning" or "evening"');
        }

        if (users.length === 0) {
            console.log(`[MindTrainNotification] No users to notify for ${notificationType}`);
            return {
                success: true,
                deliveryMethod: 'targeted',
                message: 'No users to notify',
                channels: [],
                stats: {
                    socketBroadcastCount: 0,
                    pushProcessedCount: 0,
                    pushFailedCount: 0,
                    usersProcessed: 0
                }
            };
        }

        // Prepare notification message
        const title = 'MindTrain Sync';
        const message = `Checking alarm schedule (${notificationType})`;

        let socketBroadcastCount = 0;
        let pushProcessedCount = 0;
        let pushFailedCount = 0;
        const batchSize = 50; // Process in smaller batches for targeted sends

        // Process users in batches
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async (user) => {
                try {
                    const userId = user.userId;
                    const profileId = user.fcmSchedule?.activeProfileId;
                    
                    // Prepare notification payload
                    const notificationPayload = {
                        profileId: profileId,
                        notificationType: notificationType,
                        timestamp: new Date().toISOString(),
                        syncSource: 'fcm',
                        broadcast: false
                    };

                    // Send via Socket.IO if user is connected
                    try {
                        const io = getIO();
                        if (io) {
                            // Send to specific user's room (if implemented)
                            // For now, we'll use a user-specific event
                            io.to(`user:${userId}`).emit('mindtrain:sync_notification', {
                                ...notificationPayload,
                                title: title,
                                body: message
                            });
                            
                            // Also emit unified notification
                            io.to(`user:${userId}`).emit('notification', {
                                id: `mindtrain_${Date.now()}_${userId}`,
                                title: title,
                                message: message,
                                category: 'MINDTRAIN',
                                type: 'MINDTRAIN_SYNC_TRIGGER',
                                createdAt: new Date(),
                                entity: profileId ? {
                                    type: 'ALARM_PROFILE',
                                    id: profileId
                                } : null,
                                payload: notificationPayload,
                                broadcast: false
                            });
                        }
                    } catch (socketError) {
                        console.warn(`[MindTrainNotification] Socket error for user ${userId}:`, socketError.message);
                    }

                    // Send FCM push notification
                    const pushResult = await sendPushNotification({
                        recipientId: userId,
                        recipientType: 'USER',
                        title: title,
                        body: message,
                        data: {
                            category: 'MINDTRAIN',
                            type: 'MINDTRAIN_SYNC_TRIGGER',
                            ...notificationPayload
                        }
                    });

                    if (pushResult.success && pushResult.sentCount > 0) {
                        // Update lastSentAt tracking after successful send
                        const lastSentField = notificationType === 'morning' 
                            ? 'lastMorningSentAt' 
                            : 'lastEveningSentAt';
                        
                        try {
                            await mindtrainUserService.updateFCMSchedule(userId, {
                                [lastSentField]: new Date(),
                                lastSentAt: new Date() // Keep for backward compatibility
                            });
                        } catch (updateError) {
                            console.error(`[MindTrainNotification] Failed to update lastSentAt for user ${userId}:`, updateError);
                            // Don't fail the whole operation if tracking update fails
                        }
                        
                        return { success: true, userId };
                    } else {
                        return { 
                            success: false, 
                            userId, 
                            reason: pushResult.reason || 'No tokens' 
                        };
                    }
                } catch (error) {
                    console.error(`[MindTrainNotification] Error sending to user ${user.userId}:`, error.message);
                    return { 
                        success: false, 
                        userId: user.userId, 
                        error: error.message 
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            
            batchResults.forEach(result => {
                if (result.success) {
                    pushProcessedCount++;
                } else {
                    pushFailedCount++;
                }
            });

            // Small delay between batches to avoid overwhelming the system
            if (i + batchSize < users.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Count socket broadcasts (approximate - based on connected users)
        try {
            const io = getIO();
            if (io) {
                const sockets = await io.fetchSockets();
                socketBroadcastCount = Math.min(sockets.length, users.length);
            }
        } catch (socketError) {
            console.warn('[MindTrainNotification] Failed to count socket broadcasts:', socketError);
        }

        console.log(`[MindTrainNotification] ✅ Targeted notification completed:`);
        console.log(`  - Users processed: ${users.length}`);
        console.log(`  - Push sent: ${pushProcessedCount}`);
        console.log(`  - Push failed: ${pushFailedCount}`);
        console.log(`  - Socket broadcasts: ${socketBroadcastCount}`);

        return {
            success: true,
            deliveryMethod: 'targeted',
            message: `Notifications sent to ${pushProcessedCount} users`,
            channels: ['IN_APP', 'PUSH'],
            stats: {
                socketBroadcastCount,
                pushProcessedCount,
                pushFailedCount,
                usersProcessed: users.length
            }
        };

    } catch (error) {
        console.error('[MindTrainNotification] Targeted notification error:', error);
        console.error('[MindTrainNotification] Error stack:', error.stack);
        return {
            success: false,
            deliveryMethod: 'none',
            message: 'Targeted notification failed',
            error: error.message,
            stats: {
                socketBroadcastCount: 0,
                pushProcessedCount: 0,
                pushFailedCount: 0,
                usersProcessed: 0
            }
        };
    }
};

module.exports = {
    broadcastMindTrainNotification, // Keep for backward compatibility
    sendTargetedMindTrainNotification // New function
};
