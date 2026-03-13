/**
 * Sync Health Service Adapter
 * 
 * Adapter that bridges old API format and new unified MindTrainUser model for sync health.
 * Maintains 100% backward compatibility with existing controllers.
 */

const mindtrainUserService = require('../mindtrainUser.service');
const logger = require('../../../utils/logger').child({ component: 'SyncHealthServiceAdapter' });
const metrics = require('../../../utils/metrics');
const { transformOldHealthToNew } = require('../../../utils/transformers');
const {
    SyncHealthError,
    ValidationError,
    UserNotFoundError
} = require('../../../utils/errors');

class SyncHealthServiceAdapter {
    constructor(service = mindtrainUserService, log = logger, metric = metrics, transformer = { transformOldHealthToNew }) {
        this.service = service;
        this.logger = log;
        this.metrics = metric;
        this.transformOldToNew = transformer.transformOldHealthToNew;
    }

    /**
     * Calculate health score based on sync metrics
     * (Copied from old service for backward compatibility)
     */
    calculateHealthScore(metrics) {
        let score = 100;

        const {
            workManagerStatus,
            fcmStatus,
            missedAlarmsCount = 0,
            dozeMode = false,
            networkConnectivity
        } = metrics;

        if (workManagerStatus === 'failed') score -= 15;
        else if (workManagerStatus === 'timeout') score -= 10;
        else if (workManagerStatus === 'cancelled') score -= 5;

        if (fcmStatus === 'failed') score -= 20;
        else if (fcmStatus === 'not_received') score -= 15;
        else if (fcmStatus === 'pending') score -= 5;

        const missedAlarmsPenalty = Math.min(missedAlarmsCount * 10, 30);
        score -= missedAlarmsPenalty;

        if (dozeMode) score -= 5;
        if (networkConnectivity === 'none') score -= 5;
        else if (networkConnectivity === 'mobile') score -= 2;

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Get health status label based on score
     */
    getHealthStatus(score) {
        if (score >= 90) return 'excellent';
        if (score >= 75) return 'good';
        if (score >= 60) return 'fair';
        if (score >= 40) return 'poor';
        return 'critical';
    }

    /**
     * Generate recommendations based on sync health
     */
    generateRecommendations(healthData) {
        const recommendations = [];
        const { score, workManagerStatus, fcmStatus, missedAlarmsCount, dozeMode } = healthData;

        if (score < 70) {
            recommendations.push('Sync health is below optimal. Please check your device settings.');
        }
        if (workManagerStatus === 'failed' || workManagerStatus === 'timeout') {
            recommendations.push('WorkManager is experiencing issues. FCM notifications will be used as fallback.');
        }
        if (fcmStatus === 'failed' || fcmStatus === 'not_received') {
            recommendations.push('FCM notifications are not being received. Please check your internet connection.');
        }
        if (missedAlarmsCount > 0) {
            recommendations.push(`${missedAlarmsCount} alarm(s) were missed. Consider checking device battery optimization settings.`);
        }
        if (dozeMode) {
            recommendations.push('Device is in doze mode. This may affect alarm reliability.');
        }

        return recommendations;
    }

    /**
     * Record sync health log
     * 
     * @param {Object} healthData - Health data (old format)
     * @returns {Promise<Object>} Created sync health log with health score and recommendations
     */
    async recordSyncHealth(healthData) {
        const operationLogger = this.logger.child({ 
            operation: 'recordSyncHealth', 
            userId: healthData?.userId,
            deviceId: healthData?.deviceId
        });
        
        return await this.metrics.record('adapter_sync_health_record', async () => {
            try {
                const { userId, deviceId, deviceState = {}, syncMetrics = {} } = healthData;

                if (!userId || !deviceId) {
                    throw new ValidationError('userId and deviceId are required');
                }

                operationLogger.debug('Recording sync health');

                // Calculate health score
                const healthScore = this.calculateHealthScore({
                    workManagerStatus: syncMetrics.lastWorkManagerStatus,
                    fcmStatus: syncMetrics.lastFCMStatus,
                    missedAlarmsCount: syncMetrics.missedAlarmsCount || 0,
                    dozeMode: deviceState.dozeMode || false,
                    networkConnectivity: deviceState.networkConnectivity
                });

                // Prepare sync health log data
                const logData = {
                    deviceId: String(deviceId).trim(),
                    reportedAt: new Date(),
                    lastWorkManagerCheck: syncMetrics.lastWorkManagerCheck 
                        ? new Date(syncMetrics.lastWorkManagerCheck) 
                        : null,
                    workManagerStatus: syncMetrics.lastWorkManagerStatus || 'not_ran',
                    lastFCMReceived: syncMetrics.lastFCMReceived 
                        ? new Date(syncMetrics.lastFCMReceived) 
                        : null,
                    fcmStatus: syncMetrics.lastFCMStatus || 'not_received',
                    missedAlarmsCount: syncMetrics.missedAlarmsCount || 0,
                    missedAlarmsReason: syncMetrics.missedAlarmsReason || null,
                    dozeMode: deviceState.dozeMode || false,
                    batteryLevel: deviceState.batteryLevel || null,
                    networkConnectivity: deviceState.networkConnectivity || null,
                    healthScore,
                    appVersion: deviceState.appVersion || null,
                    osVersion: deviceState.osVersion || null,
                    notes: deviceState.notes || null
                };

                // Ensure user exists
                let user = await this.service.getMindTrainUser(userId);
                if (!user) {
                    operationLogger.debug('User not found, creating new user');
                    user = await this.service.createMindTrainUser(userId);
                }

                // Add sync health log
                const updatedUser = await this.service.addSyncHealthLog(userId, logData);

                // Update alarm profile sync health score if active profile exists
                const activeProfile = updatedUser.alarmProfiles?.find(p => p.isActive === true);
                if (activeProfile) {
                    await this.service.updateAlarmProfile(userId, activeProfile.id, {
                        syncHealthScore: healthScore,
                        lastSyncStatus: healthScore >= 70 ? 'success' : 'failed'
                    });
                }

                operationLogger.info('Sync health recorded successfully', { healthScore });

                return {
                    log: logData, // Return log data (old format expects this)
                    healthScore,
                    status: this.getHealthStatus(healthScore),
                    recommendations: this.generateRecommendations({
                        score: healthScore,
                        workManagerStatus: syncMetrics.lastWorkManagerStatus,
                        fcmStatus: syncMetrics.lastFCMStatus,
                        missedAlarmsCount: syncMetrics.missedAlarmsCount || 0,
                        dozeMode: deviceState.dozeMode || false
                    })
                };
            } catch (error) {
                if (error instanceof ValidationError) {
                    throw error;
                }
                operationLogger.error('Error recording sync health', error, { 
                    userId: healthData?.userId,
                    deviceId: healthData?.deviceId
                });
                throw new SyncHealthError('Failed to record sync health', error);
            }
        }, { adapter: 'syncHealth', operation: 'record' });
    }

    /**
     * Get recent sync health logs for a user
     * 
     * @param {string|ObjectId} userId - User ID
     * @param {number} limit - Number of logs to retrieve (default: 10)
     * @returns {Promise<Array>} Array of sync health logs (old format)
     */
    async getRecentSyncHealthLogs(userId, limit = 10) {
        const operationLogger = this.logger.child({ 
            operation: 'getRecentSyncHealthLogs', 
            userId,
            limit
        });
        
        return await this.metrics.record('adapter_sync_health_logs_get', async () => {
            try {
                if (!userId) {
                    throw new ValidationError('userId is required');
                }

                operationLogger.debug('Getting recent sync health logs');

                const user = await this.service.getMindTrainUser(userId);
                if (!user || !user.syncHealthLogs) {
                    return [];
                }

                // Sort by reportedAt descending and limit
                const logs = user.syncHealthLogs
                    .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))
                    .slice(0, limit);

                // Transform to old format (add userId to each log)
                return logs.map(log => ({
                    ...log,
                    userId: user.userId
                }));
            } catch (error) {
                if (error instanceof ValidationError) {
                    throw error;
                }
                operationLogger.error('Error getting recent sync health logs', error, { userId });
                throw new SyncHealthError('Failed to get recent sync health logs', error);
            }
        }, { adapter: 'syncHealth', operation: 'getRecent' });
    }

    /**
     * Detect sync patterns and issues
     * 
     * @param {string|ObjectId} userId - User ID
     * @returns {Promise<Object>} Pattern analysis results
     */
    async detectSyncPatterns(userId) {
        const operationLogger = this.logger.child({ 
            operation: 'detectSyncPatterns', 
            userId
        });
        
        return await this.metrics.record('adapter_sync_patterns_detect', async () => {
            try {
                if (!userId) {
                    throw new ValidationError('userId is required');
                }

                operationLogger.debug('Detecting sync patterns');

                const user = await this.service.getMindTrainUser(userId);
                if (!user || !user.syncHealthLogs || user.syncHealthLogs.length === 0) {
                    return {
                        pattern: 'insufficient_data',
                        issues: [],
                        recommendations: []
                    };
                }

                // Get last 7 days of health logs
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                const recentLogs = user.syncHealthLogs.filter(
                    log => new Date(log.reportedAt) >= sevenDaysAgo
                );

                if (recentLogs.length === 0) {
                    return {
                        pattern: 'insufficient_data',
                        issues: [],
                        recommendations: []
                    };
                }

                // Analyze patterns
                const workManagerFailures = recentLogs.filter(
                    log => log.workManagerStatus === 'failed' || log.workManagerStatus === 'timeout'
                ).length;

                const fcmFailures = recentLogs.filter(
                    log => log.fcmStatus === 'failed' || log.fcmStatus === 'not_received'
                ).length;

                const bothFailing = recentLogs.filter(
                    log => (log.workManagerStatus === 'failed' || log.workManagerStatus === 'timeout') &&
                           (log.fcmStatus === 'failed' || log.fcmStatus === 'not_received')
                ).length;

                const issues = [];
                const recommendations = [];

                if (workManagerFailures >= 3) {
                    issues.push('WorkManager consistently failing');
                    recommendations.push('Consider increasing FCM notification frequency');
                }

                if (fcmFailures >= 2) {
                    issues.push('FCM notifications not being delivered');
                    recommendations.push('Check device FCM token and network connectivity');
                }

                if (bothFailing > 0) {
                    issues.push('Both sync mechanisms failing');
                    recommendations.push('URGENT: User sync is completely failing - manual intervention required');
                }

                return {
                    pattern: issues.length > 0 ? 'degraded' : 'healthy',
                    issues,
                    recommendations,
                    stats: {
                        totalLogs: recentLogs.length,
                        workManagerFailures,
                        fcmFailures,
                        bothFailing
                    }
                };
            } catch (error) {
                if (error instanceof ValidationError) {
                    throw error;
                }
                operationLogger.error('Error detecting sync patterns', error, { userId });
                throw new SyncHealthError('Failed to detect sync patterns', error);
            }
        }, { adapter: 'syncHealth', operation: 'detectPatterns' });
    }
}

module.exports = SyncHealthServiceAdapter;

