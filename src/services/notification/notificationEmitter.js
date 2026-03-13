const Notification = require('../../models/notification/Notification');
const mongoose = require('mongoose');

/**
 * Global Notification Emitter Service
 * 
 * This is the core brain of the notification system. Any part of the backend
 * can emit notifications using this single function without knowing how
 * notifications are stored or delivered.
 * 
 * Design Principles:
 * - Fail-safe: Notification failures must NEVER break business flows
 * - Fire-and-forget: Can be called without await
 * - Validation: Validates required fields before creating notification
 * - Logging: Structured logs for debugging and monitoring
 * 
 * Usage:
 *   const { emitNotification } = require('./services/notification/notificationEmitter');
 *   
 *   // Simple usage (fire-and-forget)
 *   emitNotification({
 *     recipientId: userId,
 *     recipientType: 'USER',
 *     category: 'COURSE',
 *     type: 'COURSE_ENROLL_APPROVED',
 *     title: 'Enrollment Approved',
 *     message: 'Your enrollment has been approved.'
 *   });
 * 
 *   // With entity and payload
 *   emitNotification({
 *     recipientId: userId,
 *     recipientType: 'USER',
 *     category: 'COURSE',
 *     type: 'COURSE_ENROLL_APPROVED',
 *     title: 'Enrollment Approved',
 *     message: 'Your enrollment has been approved.',
 *     entity: { type: 'COURSE', id: courseId },
 *     payload: { courseName: 'Introduction to JavaScript' },
 *     priority: 'HIGH'
 *   });
 */

/**
 * Emit a notification
 * 
 * @param {Object} payload - Notification payload
 * @param {ObjectId} payload.recipientId - ID of the recipient (User/University/Admin)
 * @param {String} payload.recipientType - 'USER' | 'UNIVERSITY' | 'ADMIN'
 * @param {String} payload.category - 'COURSE' | 'VIDEO' | 'SOCIAL' | 'MARKETPLACE' | 'WALLET' | 'SYSTEM'
 * @param {String} payload.type - Event identifier (e.g., 'COURSE_ENROLL_APPROVED')
 * @param {String} payload.title - Short notification title
 * @param {String} payload.message - Human-readable message
 * @param {Object} [payload.entity] - Optional entity reference { type: String, id: ObjectId }
 * @param {Object} [payload.payload] - Optional extra data for frontend
 * @param {String} [payload.priority] - 'LOW' | 'NORMAL' | 'HIGH' (default: 'NORMAL')
 * @param {Array<String>} [payload.channels] - Delivery channels (default: ['IN_APP'])
 * 
 * @returns {Promise<void>} - Resolves when notification is created (or fails silently)
 */
const emitNotification = async (payload) => {
    try {
        // Validate required fields
        const requiredFields = ['recipientId', 'recipientType', 'category', 'type', 'title', 'message'];
        const missingFields = requiredFields.filter(field => !payload || payload[field] === undefined || payload[field] === null);

        if (missingFields.length > 0) {
            console.error('❌ Notification emission failed: Missing required fields', {
                missingFields,
                providedPayload: payload ? Object.keys(payload) : 'null'
            });
            return; // Fail silently - don't break business flow
        }

        // Validate recipientType enum
        const validRecipientTypes = ['USER', 'UNIVERSITY', 'ADMIN'];
        if (!validRecipientTypes.includes(payload.recipientType)) {
            console.error('❌ Notification emission failed: Invalid recipientType', {
                recipientType: payload.recipientType,
                validTypes: validRecipientTypes
            });
            return;
        }

        // Validate category enum
        const validCategories = ['COURSE', 'VIDEO', 'SOCIAL', 'MARKETPLACE', 'WALLET', 'SYSTEM', 'MINDTRAIN'];
        if (!validCategories.includes(payload.category)) {
            console.error('❌ Notification emission failed: Invalid category', {
                category: payload.category,
                validCategories
            });
            return;
        }

        // Validate recipientId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(payload.recipientId)) {
            console.error('❌ Notification emission failed: Invalid recipientId', {
                recipientId: payload.recipientId
            });
            return;
        }

        // Validate entity.id if entity is provided
        if (payload.entity && payload.entity.id && !mongoose.Types.ObjectId.isValid(payload.entity.id)) {
            console.error('❌ Notification emission failed: Invalid entity.id', {
                entityId: payload.entity.id
            });
            return;
        }

        // Validate priority enum if provided
        if (payload.priority) {
            const validPriorities = ['LOW', 'NORMAL', 'HIGH'];
            if (!validPriorities.includes(payload.priority)) {
                console.error('❌ Notification emission failed: Invalid priority', {
                    priority: payload.priority,
                    validPriorities
                });
                return;
            }
        }

        // Build notification document
        const notificationData = {
            recipientId: payload.recipientId,
            recipientType: payload.recipientType,
            category: payload.category,
            type: payload.type,
            title: payload.title.trim(),
            message: payload.message.trim(),
            entity: payload.entity || undefined,
            payload: payload.payload || {},
            priority: payload.priority || 'NORMAL',
            channels: payload.channels || ['IN_APP'],
            isRead: false,
            readAt: null,
            // Broadcast fields (if provided)
            broadcast: payload._broadcast || false,
            broadcastScope: payload._broadcastScope || null,
            createdBy: payload._createdBy || null
        };

        // Create notification document
        const notification = await Notification.create(notificationData);

        // Enqueue delivery job (socket + push handled by worker)
        try {
            const { enqueueNotificationDelivery } = require('../../queues/notification.queue');
            
            // Convert ObjectId to string for queue serialization
            await enqueueNotificationDelivery({
                notificationId: notification._id.toString(),
                recipient: {
                    id: payload.recipientId.toString(),
                    role: payload.recipientType
                }
            });
        } catch (queueError) {
            // Queue failure should not break DB write
            // Log error but continue
            console.error('⚠️  Failed to enqueue notification delivery (notification still saved):', {
                error: queueError.message,
                notificationId: notification._id
            });
        }

        // Log success
        console.log('🔔 Notification emitted', {
            notificationId: notification._id,
            type: payload.type,
            recipientType: payload.recipientType,
            recipientId: payload.recipientId.toString(),
            category: payload.category,
            priority: notificationData.priority,
            channels: notificationData.channels
        });

    } catch (error) {
        // Fail silently - notification errors should never break business flows
        console.error('❌ Notification emission error (silently handled):', {
            error: error.message,
            stack: error.stack,
            payload: payload ? {
                type: payload.type,
                recipientType: payload.recipientType,
                recipientId: payload.recipientId?.toString(),
                category: payload.category
            } : 'null'
        });
        // Do NOT throw - this is intentional
        // The calling code should continue normally even if notification fails
    }
};

/**
 * Emit notification (fire-and-forget wrapper)
 * 
 * This wrapper allows calling emitNotification without await.
 * It handles the promise internally and never throws.
 * 
 * Usage:
 *   emitNotificationSync({ ... }); // No await needed
 */
const emitNotificationSync = (payload) => {
    // Fire and forget - don't wait for completion
    emitNotification(payload).catch(() => {
        // Already handled in emitNotification, but extra safety
    });
};

module.exports = {
    emitNotification,
    emitNotificationSync
};
