const mongoose = require('mongoose');
const { getMindTrainConnection } = require('../../config/dbMindTrain');

/**
 * NotificationLog Model
 * 
 * Tracks FCM notification delivery status and lifecycle.
 * Used for monitoring sync trigger notifications and other alarm-related notifications.
 * 
 * Features:
 * - Notification lifecycle tracking (scheduled, sent, delivered, opened, failed)
 * - Delivery retry logic
 * - Device and FCM token tracking
 * - Metadata for sync triggers and alarm events
 * 
 * NOTE: This model uses the MindTrain database connection (separate from main DB)
 */

const notificationLogSchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Unique notification identifier
    notificationId: {
        type: String,
        unique: true,
        index: true,
        required: true,
        trim: true
    },

    // Notification type
    type: {
        type: String,
        enum: ['sync_trigger', 'alarm_missed', 'schedule_update', 'system_alert'],
        default: 'sync_trigger'
    },

    // Timing - notification lifecycle
    scheduledTime: {
        type: Date
    },

    sentAt: {
        type: Date,
        default: null
    },

    deliveredAt: {
        type: Date,
        default: null
    },

    openedAt: {
        type: Date,
        default: null
    },

    failedAt: {
        type: Date,
        default: null
    },

    // Status tracking
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'opened', 'failed', 'bounced'],
        default: 'pending'
    },

    deliveryError: {
        type: String,
        default: null,
        trim: true
    },

    deliveryRetries: {
        type: Number,
        default: 0,
        min: 0
    },

    // Content
    title: {
        type: String,
        default: null,
        trim: true
    },

    body: {
        type: String,
        default: null,
        trim: true
    },

    // Notification data payload
    data: {
        profileId: {
            type: String,
            default: null
        },
        syncSource: {
            type: String,
            default: null
        },
        reason: {
            type: String,
            default: null
        }
    },

    // Device info
    deviceId: {
        type: String,
        default: null,
        trim: true
    },

    fcmToken: {
        type: String,
        default: null,
        trim: true
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// Indexes for better query performance
// Index on type for filtering by notification type
notificationLogSchema.index({ type: 1 });

// Index on scheduledTime for scheduled queries
notificationLogSchema.index({ scheduledTime: 1 });

// Index on status for status-based queries
notificationLogSchema.index({ status: 1 });

// Index on deviceId for device-specific queries
notificationLogSchema.index({ deviceId: 1 });

// Index on createdAt for time-based queries
notificationLogSchema.index({ createdAt: 1 });

// Compound index for push notification scheduling
notificationLogSchema.index({ status: 1, scheduledTime: 1 });

// Index for user notification history
notificationLogSchema.index({ userId: 1, createdAt: -1 });

// Index for notification type queries
notificationLogSchema.index({ userId: 1, type: 1, createdAt: -1 });

// Index for failed notifications (for retry logic)
notificationLogSchema.index({ status: 1, deliveryRetries: 1, createdAt: 1 });

/**
 * Get or create the NotificationLog model using MindTrain database connection
 * Model is created on the MindTrain connection (separate database)
 */
const getModel = () => {
    const connection = getMindTrainConnection();
    if (!connection) {
        throw new Error(
            'MindTrain database connection not initialized. ' +
            'Ensure connectMindTrainDB() is called in server.js before loading routes.'
        );
    }
    
    // Return existing model if already registered on this connection
    if (connection.models.NotificationLog) {
        return connection.models.NotificationLog;
    }
    
    // Create and return model on the MindTrain connection
    return connection.model('NotificationLog', notificationLogSchema);
};

// Export the model (will be created when first accessed)
module.exports = getModel();

