const cron = require('node-cron');
const { broadcastMindTrainNotification } = require('../../services/MindTrain/mindTrainNotification.service');
const mindtrainUserService = require('../../services/MindTrain/mindtrainUser.service');
const { sendTargetedMindTrainNotification } = require('../../services/MindTrain/mindTrainNotification.service');

/**
 * FCM Notification Cron Job
 * 
 * Runs every 1 minute to send targeted notifications to users whose scheduled time matches.
 * Uses hybrid delivery: WebSocket for connected users (real-time), FCM for all users (reliable).
 * 
 * Smart Scheduling: Only runs during notification hours to reduce server load.
 * - Morning window: 6:00 AM - 10:00 AM UTC (processes morning notifications only)
 * - Evening window: 6:00 PM - 10:00 PM UTC (processes evening notifications only)
 * 
 * Schedule: Every 1 minute (but only executes during notification windows)
 * Features: Exact time matching, timezone conversion, deduplication
 */

let job = null;
let isRunning = false;

// Notification time windows (UTC)
// Adjust these based on your user base timezones
const NOTIFICATION_WINDOWS = {
    morning: {
        startHour: 6,  // 6:00 AM UTC
        endHour: 10    // 10:00 AM UTC
    },
    evening: {
        startHour: 18, // 6:00 PM UTC
        endHour: 22    // 10:00 PM UTC
    }
};

/**
 * Check if current time is within notification windows
 * 
 * @returns {boolean} True if within notification hours
 */
const isNotificationHour = () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    
    // Check morning window (6 AM - 10 AM UTC)
    const inMorningWindow = currentHour >= NOTIFICATION_WINDOWS.morning.startHour && 
                           currentHour < NOTIFICATION_WINDOWS.morning.endHour;
    
    // Check evening window (6 PM - 10 PM UTC)
    const inEveningWindow = currentHour >= NOTIFICATION_WINDOWS.evening.startHour && 
                            currentHour < NOTIFICATION_WINDOWS.evening.endHour;
    
    return inMorningWindow || inEveningWindow;
};

/**
 * Determine which notification type should be processed based on current time
 * @returns {string|null} 'morning', 'evening', or null if outside windows
 */
const getNotificationTypeForWindow = () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    
    // Morning window: 6 AM - 10 AM UTC
    if (currentHour >= NOTIFICATION_WINDOWS.morning.startHour && 
        currentHour < NOTIFICATION_WINDOWS.morning.endHour) {
        return 'morning';
    }
    
    // Evening window: 6 PM - 10 PM UTC
    if (currentHour >= NOTIFICATION_WINDOWS.evening.startHour && 
        currentHour < NOTIFICATION_WINDOWS.evening.endHour) {
        return 'evening';
    }
    
    return null; // Outside notification windows
};

/**
 * Process notifications for a specific type (morning or evening)
 * Uses targeted sending instead of broadcasting to all users
 */
const processNotifications = async (notificationType) => {
    try {
        const currentTime = new Date();
        console.log(`[FCMJob] Processing ${notificationType} notifications at ${currentTime.toISOString()}`);

        // Get users whose scheduled time matches exactly
        const matchingUsers = await mindtrainUserService.getUsersForNotification(
            notificationType,
            currentTime
        );

        if (matchingUsers.length === 0) {
            console.log(`[FCMJob] No users found for ${notificationType} notification at this time`);
            return {
                processed: 0,
                sent: 0,
                failed: 0
            };
        }

        console.log(`[FCMJob] Found ${matchingUsers.length} users for ${notificationType} notification`);

        // Send targeted notifications (not broadcast)
        const result = await sendTargetedMindTrainNotification(
            matchingUsers,
            notificationType
        );

        if (result.success) {
            console.log(`[FCMJob] ✅ ${notificationType} notification sent successfully`);
            console.log(`  - Users processed: ${result.stats.usersProcessed}`);
            console.log(`  - Push sent: ${result.stats.pushProcessedCount}`);
            console.log(`  - Push failed: ${result.stats.pushFailedCount}`);
            console.log(`  - Socket broadcasts: ${result.stats.socketBroadcastCount}`);

            return {
                processed: result.stats.usersProcessed,
                sent: result.stats.pushProcessedCount + result.stats.socketBroadcastCount,
                failed: result.stats.pushFailedCount
            };
        } else {
            console.error(`[FCMJob] ⚠️ Failed to send ${notificationType} notification: ${result.message || result.error}`);
            return {
                processed: 0,
                sent: 0,
                failed: 0,
                error: result.message || result.error
            };
        }

    } catch (error) {
        console.error(`[FCMJob] Error processing ${notificationType} notifications:`, error);
        return {
            processed: 0,
            sent: 0,
            failed: 0,
            error: error.message
        };
    }
};

/**
 * Main job function - runs every 1 minute
 */
const runJob = async () => {
    // Prevent concurrent executions
    if (isRunning) {
        console.log('[FCMJob] ⏭️  Job already running, skipping this execution');
        return;
    }

    // Determine which notification type to process (if any)
    const notificationType = getNotificationTypeForWindow();
    
    if (!notificationType) {
        const now = new Date();
        const currentHour = now.getUTCHours();
        console.log(`[FCMJob] ⏸️  Skipping check (outside notification hours, current UTC hour: ${currentHour})`);
        return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
        const now = new Date();
        console.log(`[FCMJob] 🚀 Starting FCM notification check at ${now.toISOString()}`);
        console.log(`[FCMJob] Processing ${notificationType} notifications only`);

        // Process only the relevant notification type
        const result = await processNotifications(notificationType);

        const duration = Date.now() - startTime;

        console.log(`[FCMJob] ✅ Complete in ${duration}ms:`);
        console.log(`  - Processed: ${result.processed} users`);
        console.log(`  - Sent: ${result.sent} notifications`);
        console.log(`  - Failed: ${result.failed} notifications`);

    } catch (error) {
        console.error('[FCMJob] ❌ Job execution error:', error);
    } finally {
        isRunning = false;
    }
};

/**
 * Start the cron job
 */
const start = () => {
    if (job) {
        console.log('[FCMJob] ⚠️  Job already started');
        return;
    }

    // Run every 1 minute for exact timing: */1 * * * *
    job = cron.schedule('*/1 * * * *', runJob, {
        scheduled: true,
        timezone: 'UTC'
    });

    console.log('[FCMJob] ✅ Started (runs every 1 minute for exact timing)');
    
    // Run immediately on start (optional - for testing)
    // Uncomment if you want to run immediately on server start:
    // runJob();
};

/**
 * Stop the cron job
 */
const stop = () => {
    if (job) {
        job.stop();
        job = null;
        console.log('[FCMJob] ⏹️  Stopped');
    }
};

/**
 * Get job status
 */
const getStatus = () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const inWindow = isNotificationHour();
    const notificationType = getNotificationTypeForWindow();
    
    return {
        isRunning: isRunning,
        isScheduled: job !== null,
        schedule: '*/1 * * * * (every 1 minute, exact timing enabled)',
        currentUTCHour: currentHour,
        inNotificationWindow: inWindow,
        currentNotificationType: notificationType,
        notificationWindows: NOTIFICATION_WINDOWS,
        nextWindow: getNextWindow()
    };
};

/**
 * Get next notification window time
 */
const getNextWindow = () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    
    // If before morning window
    if (currentHour < NOTIFICATION_WINDOWS.morning.startHour) {
        const next = new Date(now);
        next.setUTCHours(NOTIFICATION_WINDOWS.morning.startHour, 0, 0, 0);
        return { type: 'morning', time: next.toISOString() };
    }
    
    // If between morning and evening window
    if (currentHour < NOTIFICATION_WINDOWS.evening.startHour) {
        const next = new Date(now);
        next.setUTCHours(NOTIFICATION_WINDOWS.evening.startHour, 0, 0, 0);
        return { type: 'evening', time: next.toISOString() };
    }
    
    // If after evening window, next is tomorrow morning
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(NOTIFICATION_WINDOWS.morning.startHour, 0, 0, 0);
    return { type: 'morning', time: next.toISOString() };
};

module.exports = {
    start,
    stop,
    getStatus,
    runJob // Export for manual testing
};

