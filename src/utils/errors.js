/**
 * Custom Error Classes for MindTrain
 * 
 * Provides structured error handling with proper HTTP status codes
 * and error serialization for API responses.
 */

/**
 * Base error class for all MindTrain errors
 */
class MindTrainError extends Error {
    constructor(message, statusCode = 500, code = 'MINDTRAIN_ERROR', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Serialize error for API response
     * @returns {Object} Serialized error object
     */
    toJSON() {
        return {
            success: false,
            message: this.message,
            code: this.code,
            ...(this.details && { details: this.details }),
            ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
        };
    }
}

/**
 * Profile creation error
 */
class ProfileCreationError extends MindTrainError {
    constructor(message = 'Failed to create alarm profile', details = null) {
        super(message, 400, 'PROFILE_CREATION_ERROR', details);
    }
}

/**
 * Profile not found error
 */
class ProfileNotFoundError extends MindTrainError {
    constructor(profileId = null) {
        const message = profileId 
            ? `Alarm profile with ID '${profileId}' not found`
            : 'Alarm profile not found';
        super(message, 404, 'PROFILE_NOT_FOUND', { profileId });
    }
}

/**
 * Validation error
 */
class ValidationError extends MindTrainError {
    constructor(message = 'Validation failed', errors = {}) {
        super(message, 400, 'VALIDATION_ERROR', { errors });
        this.errors = errors;
    }
}

/**
 * Database error
 */
class DatabaseError extends MindTrainError {
    constructor(message = 'Database operation failed', originalError = null) {
        super(message, 500, 'DATABASE_ERROR', 
            originalError ? { originalError: originalError.message } : null);
        this.originalError = originalError;
    }
}

/**
 * Concurrency error (e.g., race condition)
 */
class ConcurrencyError extends MindTrainError {
    constructor(message = 'Concurrent modification detected', details = null) {
        super(message, 409, 'CONCURRENCY_ERROR', details);
    }
}

/**
 * User not found error
 */
class UserNotFoundError extends MindTrainError {
    constructor(userId = null) {
        const message = userId 
            ? `MindTrain user with ID '${userId}' not found`
            : 'MindTrain user not found';
        super(message, 404, 'USER_NOT_FOUND', { userId });
    }
}

/**
 * FCM schedule error
 */
class FCMScheduleError extends MindTrainError {
    constructor(message = 'FCM schedule operation failed', details = null) {
        super(message, 400, 'FCM_SCHEDULE_ERROR', details);
    }
}

/**
 * Sync health error
 */
class SyncHealthError extends MindTrainError {
    constructor(message = 'Sync health operation failed', details = null) {
        super(message, 400, 'SYNC_HEALTH_ERROR', details);
    }
}

module.exports = {
    MindTrainError,
    ProfileCreationError,
    ProfileNotFoundError,
    ValidationError,
    DatabaseError,
    ConcurrencyError,
    UserNotFoundError,
    FCMScheduleError,
    SyncHealthError
};

