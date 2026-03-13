const mongoose = require('mongoose');

/**
 * Global Notification Model
 * 
 * This is a domain-agnostic notification system that can be used across
 * all modules (courses, videos, social, marketplace, wallet, system, etc.)
 * 
 * Design Principles:
 * - Generic: No hardcoded domain-specific logic
 * - Flexible: Uses payload and entity fields for extensibility
 * - Scalable: Indexed for efficient queries
 * - Multi-tenant: Supports USER, UNIVERSITY, and ADMIN recipients
 */

const notificationSchema = new mongoose.Schema({
    // Recipient Information
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
        // Can reference User, University, or Admin depending on recipientType
    },
    recipientType: {
        type: String,
        enum: ['USER', 'UNIVERSITY', 'ADMIN'],
        required: true,
        index: true
    },

    // Notification Classification
    category: {
        type: String,
        enum: ['COURSE', 'VIDEO', 'SOCIAL', 'MARKETPLACE', 'WALLET', 'SYSTEM', 'MINDTRAIN'],
        required: true,
        index: true
        // High-level grouping for filtering and organization
        // Example: All course-related notifications use 'COURSE'
    },
    type: {
        type: String,
        required: true
        // Event identifier (e.g., 'COURSE_ENROLL_APPROVED', 'VIDEO_UPLOADED', 'ORDER_SHIPPED')
        // This is intentionally NOT an enum to allow flexibility across modules
        // Each module can define its own notification types
    },

    // Notification Content
    title: {
        type: String,
        required: true,
        trim: true
        // Short, concise notification title
        // Example: "Enrollment Approved"
    },
    message: {
        type: String,
        required: true,
        trim: true
        // Human-readable notification message
        // Example: "Your enrollment request for 'Introduction to JavaScript' has been approved."
    },

    // Entity Reference (Generic Redirect Target)
    entity: {
        type: {
            type: String,
            trim: true
            // Entity type (e.g., 'COURSE', 'VIDEO', 'PRODUCT', 'ORDER', 'POST')
            // Used by frontend to determine where to navigate when notification is clicked
        },
        id: {
            type: mongoose.Schema.Types.ObjectId
            // Entity ID - references the specific resource
            // Example: If entity.type is 'COURSE', this is the course._id
        }
    },
    // Both entity.type and entity.id are optional
    // Some notifications may not have a specific entity to link to (e.g., system announcements)

    // Flexible Data Storage
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
        // Flexible JSON object for storing additional data
        // Each module can store module-specific data here
        // Example: { courseName: "...", videoTitle: "...", orderTotal: 100 }
        // Frontend can use this for rich notifications without additional API calls
    },

    // Delivery Channels
    channels: {
        type: [String],
        default: ['IN_APP']
        // Array of delivery channels
        // Current: ['IN_APP'] - shown in app notification center
        // Future: Can include 'PUSH', 'EMAIL', 'SMS'
        // Allows different notification types to use different delivery methods
    },

    // Priority Level
    priority: {
        type: String,
        enum: ['LOW', 'NORMAL', 'HIGH'],
        default: 'NORMAL',
        index: true
        // Notification priority for sorting and filtering
        // HIGH: Urgent (e.g., payment failed, account suspended)
        // NORMAL: Standard notifications (e.g., new message, order shipped)
        // LOW: Informational (e.g., weekly digest, feature announcement)
    },

    // Read Status
    isRead: {
        type: Boolean,
        default: false,
        index: true
        // Whether the recipient has read this notification
    },
    readAt: {
        type: Date,
        default: null
        // Timestamp when notification was read
        // null if unread
    },

    // Broadcast Fields (for admin/system-wide notifications)
    broadcast: {
        type: Boolean,
        default: false,
        index: true
        // Whether this is a broadcast notification
    },
    broadcastScope: {
        type: String,
        enum: ['ALL', 'USERS', 'UNIVERSITIES'],
        default: null
        // Scope of broadcast: ALL, USERS, or UNIVERSITIES
        // Only set when broadcast = true
    },
    createdBy: {
        type: String,
        enum: ['SYSTEM', 'ADMIN'],
        default: null
        // Who created this notification
        // SYSTEM = automated/system notifications
        // ADMIN = manually created by admin
    }
}, {
    timestamps: true
    // Automatically adds createdAt and updatedAt fields
    // createdAt is used for sorting notifications chronologically
});

// Compound Index: recipientId + recipientType
// Critical for efficient queries like "Get all unread notifications for user X"
notificationSchema.index({ recipientId: 1, recipientType: 1 });

// Compound Index: recipient + read status + creation date
// Optimizes queries like "Get unread notifications for user, sorted by newest"
notificationSchema.index({ 
    recipientId: 1, 
    recipientType: 1, 
    isRead: 1, 
    createdAt: -1 
});

// Compound Index: category + creation date
// Useful for filtering notifications by category (e.g., "Show only COURSE notifications")
notificationSchema.index({ category: 1, createdAt: -1 });

// Index on createdAt (descending) for chronological sorting
notificationSchema.index({ createdAt: -1 });

// Index for broadcast queries
notificationSchema.index({ broadcast: 1, broadcastScope: 1 });
notificationSchema.index({ createdBy: 1, createdAt: -1 });

/**
 * Why category ≠ type?
 * 
 * - category: High-level grouping (COURSE, VIDEO, SOCIAL, etc.)
 *   → Used for filtering and organizing notifications in UI
 *   → Limited set of values (6 categories)
 * 
 * - type: Specific event identifier (COURSE_ENROLL_APPROVED, VIDEO_UPLOADED, etc.)
 *   → Identifies the exact event that triggered the notification
 *   → Can have many values (one per event type)
 *   → Not an enum to allow flexibility across modules
 * 
 * Example:
 *   category: 'COURSE'
 *   type: 'COURSE_ENROLL_APPROVED'
 * 
 * This allows:
 *   - Filtering all course notifications: category === 'COURSE'
 *   - Handling specific events: type === 'COURSE_ENROLL_APPROVED'
 */

/**
 * Why is entity generic?
 * 
 * The entity field is intentionally generic (type + id) rather than having
 * specific fields like courseId, videoId, etc. This allows:
 * 
 * 1. Flexibility: Any module can reference any entity type
 * 2. Extensibility: New entity types can be added without schema changes
 * 3. Consistency: Single pattern for all notification-to-entity links
 * 
 * Example usage:
 *   - Course notification: { type: 'COURSE', id: courseId }
 *   - Video notification: { type: 'VIDEO', id: videoId }
 *   - Product notification: { type: 'PRODUCT', id: productId }
 * 
 * Frontend can use entity.type to determine navigation destination.
 */

/**
 * Why is payload flexible (Mixed type)?
 * 
 * The payload field stores additional data that may be needed by the frontend
 * or for processing the notification. It's flexible because:
 * 
 * 1. Different notification types need different data
 * 2. Future requirements are unknown
 * 3. Avoids schema bloat (no need for many optional fields)
 * 
 * Example payloads:
 *   - Course enrollment: { courseName: "...", courseId: "...", universityName: "..." }
 *   - Order shipped: { orderId: "...", trackingNumber: "...", estimatedDelivery: "..." }
 *   - New message: { senderName: "...", messagePreview: "...", conversationId: "..." }
 * 
 * Frontend can use payload data to render rich notifications without additional API calls.
 */

module.exports =
  mongoose.models.Notification ||
  mongoose.model('Notification', notificationSchema);
