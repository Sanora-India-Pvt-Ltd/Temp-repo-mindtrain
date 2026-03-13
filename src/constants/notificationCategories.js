/**
 * Notification Category Constants
 * 
 * Centralized list of notification categories used across the system.
 * This ensures consistency between:
 * - Notification model
 * - Notification preferences
 * - Notification emitter
 * 
 * Usage:
 *   const { NOTIFICATION_CATEGORIES } = require('./constants/notificationCategories');
 *   if (NOTIFICATION_CATEGORIES.includes(category)) { ... }
 */

const NOTIFICATION_CATEGORIES = [
    'SYSTEM',
    'COURSE',
    'VIDEO',
    'SOCIAL',
    'MARKETPLACE',
    'WALLET',
    'CONFERENCE',
    'PAYMENT',
    'SECURITY',
    // MindTrain learning assistant / mastery system
    'MINDTRAIN'
];

// Category enum for validation
const NOTIFICATION_CATEGORY_ENUM = {
    SYSTEM: 'SYSTEM',
    COURSE: 'COURSE',
    VIDEO: 'VIDEO',
    SOCIAL: 'SOCIAL',
    MARKETPLACE: 'MARKETPLACE',
    WALLET: 'WALLET',
    CONFERENCE: 'CONFERENCE',
    PAYMENT: 'PAYMENT',
    SECURITY: 'SECURITY',
    MINDTRAIN: 'MINDTRAIN'
};

module.exports = {
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CATEGORY_ENUM
};
