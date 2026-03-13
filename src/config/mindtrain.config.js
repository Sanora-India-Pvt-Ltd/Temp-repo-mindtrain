/**
 * MindTrain Configuration
 * 
 * Centralized configuration for MindTrain feature including:
 * - Feature flags
 * - Model limits
 * - Cache settings
 * - Database configuration
 */

const config = {
    // Feature flags
    USE_UNIFIED_MODEL: process.env.USE_UNIFIED_MODEL === 'true' || false,
    ENABLE_CACHING: process.env.ENABLE_MINDTRAIN_CACHING === 'true' || false,
    ENABLE_METRICS: process.env.ENABLE_MINDTRAIN_METRICS !== 'false', // Default: true

    // Model limits
    MAX_NOTIFICATION_LOGS: parseInt(process.env.MAX_NOTIFICATION_LOGS || '100', 10),
    MAX_SYNC_HEALTH_LOGS: parseInt(process.env.MAX_SYNC_HEALTH_LOGS || '50', 10),
    MAX_ALARM_PROFILES: parseInt(process.env.MAX_ALARM_PROFILES || '20', 10),

    // Cache configuration
    CACHE: {
        TTL: parseInt(process.env.MINDTRAIN_CACHE_TTL || '300', 10), // 5 minutes default
        KEY_PREFIX: process.env.MINDTRAIN_CACHE_PREFIX || 'mindtrain:',
        MAX_SIZE: parseInt(process.env.MINDTRAIN_CACHE_MAX_SIZE || '1000', 10)
    },

    // Database configuration
    DATABASE: {
        QUERY_TIMEOUT: parseInt(process.env.MINDTRAIN_QUERY_TIMEOUT || '30000', 10), // 30 seconds
        TRANSACTION_TIMEOUT: parseInt(process.env.MINDTRAIN_TRANSACTION_TIMEOUT || '60000', 10), // 60 seconds
        MAX_RETRIES: parseInt(process.env.MINDTRAIN_MAX_RETRIES || '3', 10),
        RETRY_DELAY: parseInt(process.env.MINDTRAIN_RETRY_DELAY || '1000', 10) // 1 second
    },

    // Logging configuration
    LOGGING: {
        LEVEL: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG'),
        ENABLE_REQUEST_LOGGING: process.env.ENABLE_REQUEST_LOGGING === 'true' || false
    },

    // Performance thresholds
    PERFORMANCE: {
        SLOW_QUERY_THRESHOLD: parseInt(process.env.SLOW_QUERY_THRESHOLD || '100', 10), // 100ms
        WARN_QUERY_THRESHOLD: parseInt(process.env.WARN_QUERY_THRESHOLD || '50', 10) // 50ms
    }
};

/**
 * Validate configuration
 */
const validateConfig = () => {
    const errors = [];

    if (config.MAX_NOTIFICATION_LOGS < 1 || config.MAX_NOTIFICATION_LOGS > 1000) {
        errors.push('MAX_NOTIFICATION_LOGS must be between 1 and 1000');
    }

    if (config.MAX_SYNC_HEALTH_LOGS < 1 || config.MAX_SYNC_HEALTH_LOGS > 500) {
        errors.push('MAX_SYNC_HEALTH_LOGS must be between 1 and 500');
    }

    if (config.MAX_ALARM_PROFILES < 1 || config.MAX_ALARM_PROFILES > 100) {
        errors.push('MAX_ALARM_PROFILES must be between 1 and 100');
    }

    if (config.DATABASE.QUERY_TIMEOUT < 1000) {
        errors.push('QUERY_TIMEOUT must be at least 1000ms');
    }

    if (errors.length > 0) {
        throw new Error(`Invalid MindTrain configuration: ${errors.join(', ')}`);
    }
};

// Validate on load
validateConfig();

module.exports = config;

