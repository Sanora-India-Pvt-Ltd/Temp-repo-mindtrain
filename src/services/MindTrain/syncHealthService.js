const SyncHealthServiceAdapter = require('./adapters/syncHealthServiceAdapter');
const mindtrainUserService = require('./mindtrainUser.service');
const logger = require('../../utils/logger');
const metrics = require('../../utils/metrics');
const transformers = require('../../utils/transformers');

/**
 * Sync Health Service
 * 
 * Wrapper service that delegates to SyncHealthServiceAdapter.
 * Maintains backward compatibility with existing controllers.
 * 
 * NOTE: This service now uses the unified MindTrainUser model via adapters.
 * The adapter handles transformation between old and new formats.
 */

// Initialize adapter
const adapter = new SyncHealthServiceAdapter(
    mindtrainUserService,
    logger,
    metrics,
    transformers
);

/**
 * Calculate health score based on sync metrics
 * 
 * @param {Object} metrics - Sync metrics
 * @returns {number} Health score (0-100)
 */
const calculateHealthScore = (metrics) => {
    return adapter.calculateHealthScore(metrics);
};

/**
 * Get health status label based on score
 * 
 * @param {number} score - Health score
 * @returns {string} Status label
 */
const getHealthStatus = (score) => {
    return adapter.getHealthStatus(score);
};

/**
 * Generate recommendations based on sync health
 * 
 * @param {Object} healthData - Health data including score and metrics
 * @returns {Array<string>} Array of recommendation messages
 */
const generateRecommendations = (healthData) => {
    return adapter.generateRecommendations(healthData);
};

/**
 * Record sync health log
 * 
 * @param {Object} healthData - Health data
 * @param {string|ObjectId} healthData.userId - User ID
 * @param {string} healthData.deviceId - Device ID
 * @param {Object} healthData.deviceState - Device state
 * @param {Object} healthData.syncMetrics - Sync metrics
 * @returns {Promise<Object>} Created sync health log
 */
const recordSyncHealth = async (healthData) => {
    return adapter.recordSyncHealth(healthData);
};

/**
 * Get recent sync health logs for a user
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {number} limit - Number of logs to retrieve (default: 10)
 * @returns {Promise<Array>} Array of sync health logs
 */
const getRecentSyncHealthLogs = async (userId, limit = 10) => {
    return adapter.getRecentSyncHealthLogs(userId, limit);
};

/**
 * Detect sync patterns and issues
 * 
 * @param {string|ObjectId} userId - User ID
 * @returns {Promise<Object>} Pattern analysis results
 */
const detectSyncPatterns = async (userId) => {
    return adapter.detectSyncPatterns(userId);
};

module.exports = {
    recordSyncHealth,
    calculateHealthScore,
    getHealthStatus,
    generateRecommendations,
    getRecentSyncHealthLogs,
    detectSyncPatterns
};
