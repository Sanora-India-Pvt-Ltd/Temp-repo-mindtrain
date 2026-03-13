const mongoose = require('mongoose');
const { getMindTrainConnection } = require('../../config/dbMindTrain');

/**
 * SyncHealthLog Model
 * 
 * Tracks sync health metrics reported by client devices.
 * Used to monitor the reliability of WorkManager and FCM sync mechanisms.
 * 
 * Features:
 * - WorkManager status tracking
 * - FCM delivery status tracking
 * - Missed alarm detection and reporting
 * - Device state monitoring (doze mode, battery, network)
 * - Health score calculation
 * 
 * NOTE: This model uses the MindTrain database connection (separate from main DB)
 */

const syncHealthLogSchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Device identifier
    deviceId: {
        type: String,
        required: true,
        index: true,
        trim: true
    },

    reportedAt: {
        type: Date,
        default: Date.now,
        index: true
    },

    // Sync metrics - WorkManager
    lastWorkManagerCheck: {
        type: Date,
        default: null
    },

    workManagerStatus: {
        type: String,
        enum: ['success', 'failed', 'timeout', 'cancelled', 'not_ran'],
        default: 'not_ran'
    },

    // Sync metrics - FCM
    lastFCMReceived: {
        type: Date,
        default: null
    },

    fcmStatus: {
        type: String,
        enum: ['delivered', 'failed', 'pending', 'not_received'],
        default: 'not_received'
    },

    // Alarm metrics
    missedAlarmsCount: {
        type: Number,
        default: 0,
        min: 0
    },

    missedAlarmsReason: {
        type: String,
        enum: [
            'workmanager_not_triggered',
            'hive_corrupted',
            'network_error',
            'device_doze',
            'unknown'
        ],
        default: null
    },

    // Device state
    dozeMode: {
        type: Boolean,
        default: false
    },

    batteryLevel: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },

    networkConnectivity: {
        type: String,
        enum: ['wifi', 'mobile', 'none'],
        default: null,
        trim: true
    },

    // Health score calculation (0-100)
    healthScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 100
    },

    // Metadata
    appVersion: {
        type: String,
        default: null,
        trim: true
    },

    osVersion: {
        type: String,
        default: null,
        trim: true
    },

    notes: {
        type: String,
        default: null,
        trim: true
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// Indexes for better query performance
// Compound index for quick health checks per user (this matches the expected index)
syncHealthLogSchema.index({ userId: 1, reportedAt: -1 });

// Index for device-specific health logs
syncHealthLogSchema.index({ deviceId: 1, reportedAt: -1 });

// Index for health score analysis
syncHealthLogSchema.index({ userId: 1, healthScore: 1, reportedAt: -1 });

/**
 * Get or create the SyncHealthLog model using MindTrain database connection
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
    if (connection.models.SyncHealthLog) {
        return connection.models.SyncHealthLog;
    }
    
    // Create and return model on the MindTrain connection
    return connection.model('SyncHealthLog', syncHealthLogSchema);
};

// Export the model (will be created when first accessed)
module.exports = getModel();

