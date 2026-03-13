const mongoose = require('mongoose');
const { getMindTrainConnection } = require('../../config/dbMindTrain');

/**
 * FCMSchedule Model
 * 
 * Manages FCM (Firebase Cloud Messaging) notification schedules for alarm profiles.
 * Tracks when morning and evening sync trigger notifications should be sent.
 * 
 * Features:
 * - Morning and evening notification timing
 * - Timezone support
 * - Delivery tracking and retry logic
 * - Next scheduled notification tracking
 * 
 * NOTE: This model uses the MindTrain database connection (separate from main DB)
 */

const fcmScheduleSchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Active alarm profile reference
    activeProfileId: {
        type: String,
        ref: 'AlarmProfile',
        required: true
    },

    // Notification timing
    morningNotificationTime: {
        type: String,
        required: true,
        match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/,
        default: '08:00',
        trim: true
    },

    eveningNotificationTime: {
        type: String,
        required: true,
        match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/,
        default: '20:00',
        trim: true
    },

    timezone: {
        type: String,
        default: 'UTC',
        trim: true
    },

    isEnabled: {
        type: Boolean,
        default: true
    },

    // Delivery tracking
    lastSentAt: {
        type: Date,
        default: null
    },

    nextMorningNotification: {
        type: Date
    },

    nextEveningNotification: {
        type: Date
    },

    // Metadata
    deliveryRetries: {
        type: Number,
        default: 0,
        min: 0
    },

    failureReason: {
        type: String,
        default: null,
        trim: true
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// Indexes for better query performance
// Unique constraint: one FCM schedule per user
fcmScheduleSchema.index({ userId: 1 }, { unique: true });

// Index on activeProfileId for profile lookups
fcmScheduleSchema.index({ activeProfileId: 1 });

// Index on timezone for timezone-based queries
fcmScheduleSchema.index({ timezone: 1 });

// Index on isEnabled for filtering enabled schedules
fcmScheduleSchema.index({ isEnabled: 1 });

// Index on nextMorningNotification for scheduled queries
fcmScheduleSchema.index({ nextMorningNotification: 1 });

// Index on nextEveningNotification for scheduled queries
fcmScheduleSchema.index({ nextEveningNotification: 1 });

// Compound index for scheduled morning push notifications
fcmScheduleSchema.index({ 
    isEnabled: 1, 
    nextMorningNotification: 1 
});

// Compound index for scheduled evening push notifications
fcmScheduleSchema.index({ 
    isEnabled: 1, 
    nextEveningNotification: 1 
});

/**
 * Get or create the FCMSchedule model using MindTrain database connection
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
    if (connection.models.FCMSchedule) {
        return connection.models.FCMSchedule;
    }
    
    // Create and return model on the MindTrain connection
    return connection.model('FCMSchedule', fcmScheduleSchema);
};

// Export the model (will be created when first accessed)
module.exports = getModel();

