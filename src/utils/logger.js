/**
 * Logger Utility for MindTrain
 * 
 * Production-grade logging with context tracking.
 * Supports structured logging with context (userId, profileId, requestId).
 * 
 * In production, this can be upgraded to use Winston or Pino.
 */

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const currentLogLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG');

/**
 * Format log message with context
 * @private
 */
const formatMessage = (level, message, context = {}) => {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(context).length > 0 
        ? ` [${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(', ')}]` 
        : '';
    
    return `[${timestamp}] [${level}]${contextStr} ${message}`;
};

/**
 * Logger class with context support
 */
class Logger {
    constructor(context = {}) {
        this.context = context;
    }

    /**
     * Create a child logger with additional context
     * @param {Object} additionalContext - Additional context to add
     * @returns {Logger} New logger instance with merged context
     */
    child(additionalContext) {
        return new Logger({ ...this.context, ...additionalContext });
    }

    /**
     * Log error message
     * @param {string} message - Error message
     * @param {Error|Object} error - Error object or additional data
     * @param {Object} context - Additional context
     */
    error(message, error = null, context = {}) {
        const mergedContext = { ...this.context, ...context };
        
        if (error instanceof Error) {
            mergedContext.error = error.message;
            mergedContext.stack = error.stack;
        } else if (error) {
            Object.assign(mergedContext, error);
        }

        console.error(formatMessage('ERROR', message, mergedContext));
        
        if (error instanceof Error && process.env.NODE_ENV !== 'production') {
            console.error(error.stack);
        }
    }

    /**
     * Log warning message
     * @param {string} message - Warning message
     * @param {Object} context - Additional context
     */
    warn(message, context = {}) {
        if (LOG_LEVELS[currentLogLevel] >= LOG_LEVELS.WARN) {
            console.warn(formatMessage('WARN', message, { ...this.context, ...context }));
        }
    }

    /**
     * Log info message
     * @param {string} message - Info message
     * @param {Object} context - Additional context
     */
    info(message, context = {}) {
        if (LOG_LEVELS[currentLogLevel] >= LOG_LEVELS.INFO) {
            console.log(formatMessage('INFO', message, { ...this.context, ...context }));
        }
    }

    /**
     * Log debug message
     * @param {string} message - Debug message
     * @param {Object} context - Additional context
     */
    debug(message, context = {}) {
        if (LOG_LEVELS[currentLogLevel] >= LOG_LEVELS.DEBUG) {
            console.debug(formatMessage('DEBUG', message, { ...this.context, ...context }));
        }
    }
}

// Default logger instance
const defaultLogger = new Logger();

// Export both default logger and Logger class
module.exports = defaultLogger;
module.exports.Logger = Logger;

