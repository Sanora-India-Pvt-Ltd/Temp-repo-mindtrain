/**
 * MindTrain Diagnostic Logger
 * 
 * Specialized logging utility for debugging MindTrain operations,
 * especially MongoDB transactions and profile activation flows.
 * 
 * Provides detailed diagnostic information for troubleshooting
 * database operations and transaction issues.
 */

const logger = require('../../utils/logger').child({ component: 'MindTrainDiagnostics' });

class MindTrainDiagnosticLogger {
    constructor(operation, context = {}) {
        this.operation = operation;
        this.context = context;
        this.startTime = Date.now();
        this.steps = [];
    }

    /**
     * Log operation start
     */
    start(message, additionalContext = {}) {
        const logContext = { 
            ...this.context, 
            ...additionalContext,
            step: 'start',
            operation: this.operation
        };
        logger.info(`[${this.operation}] START: ${message}`, logContext);
        this.logStep('START', message, logContext);
    }

    /**
     * Log operation step
     */
    step(message, data = {}) {
        const logContext = { 
            ...this.context, 
            ...data,
            step: 'step',
            operation: this.operation
        };
        logger.debug(`[${this.operation}] STEP: ${message}`, logContext);
        this.logStep('STEP', message, { ...logContext, data });
    }

    /**
     * Log MongoDB operation result
     */
    mongoOperation(operationName, result, query = null) {
        const logData = {
            operation: operationName,
            query: query ? JSON.stringify(query) : null,
            resultType: result ? typeof result : 'null',
            hasResult: result !== null && result !== undefined
        };

        // Extract MongoDB-specific result data
        if (result && typeof result === 'object') {
            if ('matchedCount' in result) {
                logData.matchedCount = result.matchedCount;
            }
            if ('modifiedCount' in result) {
                logData.modifiedCount = result.modifiedCount;
            }
            if ('upsertedCount' in result) {
                logData.upsertedCount = result.upsertedCount;
            }
            if (result._id) {
                logData.documentId = result._id.toString();
            }
            if (result.id) {
                logData.profileId = result.id;
            }
            if (result.isActive !== undefined) {
                logData.isActive = result.isActive;
            }
        }

        const logContext = { 
            ...this.context, 
            ...logData,
            step: 'mongo_operation',
            operation: this.operation
        };

        if (result === null || result === undefined) {
            logger.warn(`[${this.operation}] MONGO NULL RESULT: ${operationName} returned null/undefined`, logContext);
        } else {
            logger.debug(`[${this.operation}] MONGO OPERATION: ${operationName}`, logContext);
        }

        this.logStep('MONGO', operationName, logContext);
        return logContext;
    }

    /**
     * Log transaction state
     */
    transactionState(state, details = {}) {
        const logContext = { 
            ...this.context, 
            ...details,
            transactionState: state,
            step: 'transaction',
            operation: this.operation
        };
        logger.info(`[${this.operation}] TRANSACTION: ${state}`, logContext);
        this.logStep('TRANSACTION', state, logContext);
    }

    /**
     * Log profile state
     */
    profileState(profileId, state, details = {}) {
        const logContext = { 
            ...this.context, 
            profileId,
            ...details,
            profileState: state,
            step: 'profile_state',
            operation: this.operation
        };
        logger.debug(`[${this.operation}] PROFILE STATE: ${profileId} - ${state}`, logContext);
        this.logStep('PROFILE', `${profileId}:${state}`, logContext);
    }

    /**
     * Log user state
     */
    userState(userId, state, details = {}) {
        const logContext = { 
            ...this.context, 
            userId: userId?.toString(),
            ...details,
            userState: state,
            step: 'user_state',
            operation: this.operation
        };
        logger.debug(`[${this.operation}] USER STATE: ${state}`, logContext);
        this.logStep('USER', state, logContext);
    }

    /**
     * Log validation result
     */
    validation(check, passed, details = {}) {
        const logContext = { 
            ...this.context, 
            ...details,
            validationCheck: check,
            passed,
            step: 'validation',
            operation: this.operation
        };
        const level = passed ? 'debug' : 'warn';
        logger[level](`[${this.operation}] VALIDATION: ${check} - ${passed ? 'PASSED' : 'FAILED'}`, logContext);
        this.logStep('VALIDATION', `${check}:${passed}`, logContext);
    }

    /**
     * Log error with full context
     */
    error(message, error, additionalContext = {}) {
        const logContext = { 
            ...this.context, 
            ...additionalContext,
            errorMessage: error?.message || message,
            errorStack: error?.stack,
            errorName: error?.name,
            step: 'error',
            operation: this.operation,
            duration: Date.now() - this.startTime
        };
        logger.error(`[${this.operation}] ERROR: ${message}`, error, logContext);
        this.logStep('ERROR', message, logContext);
    }

    /**
     * Log operation completion
     */
    complete(message, result = {}) {
        const duration = Date.now() - this.startTime;
        const logContext = { 
            ...this.context, 
            ...result,
            step: 'complete',
            operation: this.operation,
            duration,
            totalSteps: this.steps.length
        };
        logger.info(`[${this.operation}] COMPLETE: ${message}`, logContext);
        this.logStep('COMPLETE', message, logContext);
    }

    /**
     * Log warning
     */
    warn(message, details = {}) {
        const logContext = { 
            ...this.context, 
            ...details,
            step: 'warning',
            operation: this.operation
        };
        logger.warn(`[${this.operation}] WARNING: ${message}`, logContext);
        this.logStep('WARNING', message, logContext);
    }

    /**
     * Internal method to track steps
     */
    logStep(type, message, data) {
        this.steps.push({
            timestamp: Date.now(),
            type,
            message,
            data: JSON.parse(JSON.stringify(data)) // Deep clone to avoid reference issues
        });
    }

    /**
     * Get full diagnostic summary
     */
    getSummary() {
        return {
            operation: this.operation,
            context: this.context,
            duration: Date.now() - this.startTime,
            totalSteps: this.steps.length,
            steps: this.steps
        };
    }

    /**
     * Log full diagnostic summary
     */
    logSummary() {
        const summary = this.getSummary();
        logger.info(`[${this.operation}] DIAGNOSTIC SUMMARY`, summary);
        return summary;
    }
}

/**
 * Create a diagnostic logger for a specific operation
 * @param {string} operation - Operation name (e.g., 'activateProfile', 'addAlarmProfile')
 * @param {Object} context - Initial context (userId, profileId, etc.)
 * @returns {MindTrainDiagnosticLogger} Logger instance
 */
const createDiagnosticLogger = (operation, context = {}) => {
    return new MindTrainDiagnosticLogger(operation, context);
};

module.exports = {
    createDiagnosticLogger,
    MindTrainDiagnosticLogger
};

