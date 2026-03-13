/**
 * MindTrain Error Handler Middleware
 * 
 * Catches and formats errors from MindTrain services.
 * Maps custom errors to appropriate HTTP status codes.
 * Maintains backward compatibility with existing error response format.
 */

const {
    MindTrainError,
    ProfileCreationError,
    ProfileNotFoundError,
    ValidationError,
    DatabaseError,
    ConcurrencyError,
    UserNotFoundError,
    FCMScheduleError,
    SyncHealthError
} = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'MindTrainErrorHandler' });
const metrics = require('../utils/metrics');

/**
 * Error handler middleware for MindTrain routes
 * Should be used after all MindTrain routes
 */
const mindtrainErrorHandler = (err, req, res, next) => {
    // If error is already handled or not a MindTrain error, pass to next handler
    if (res.headersSent || !(err instanceof MindTrainError)) {
        return next(err);
    }

    const errorLogger = logger.child({
        userId: req.userId,
        path: req.path,
        method: req.method
    });

    // Log error
    errorLogger.error('MindTrain error occurred', err, {
        code: err.code,
        statusCode: err.statusCode
    });

    // Track error metric
    metrics.increment('mindtrain_errors', 1, {
        code: err.code,
        status: err.statusCode
    });

    // Format response (maintain backward compatibility)
    const response = {
        success: false,
        message: err.message,
        code: err.code,
        ...(err.details && { details: err.details })
    };

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    return res.status(err.statusCode || 500).json(response);
};

/**
 * Async error wrapper for route handlers
 * Wraps async route handlers to catch errors and pass to error handler
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    mindtrainErrorHandler,
    asyncHandler
};

