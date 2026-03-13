const { notifyMindTrainEvent } = require('../../services/MindTrain/mindTrainNotification.service');

/**
 * POST /api/mindtrain/events
 *
 * Auth: flexibleAuth (USER or UNIVERSITY)
 *
 * Body example:
 * {
 *   "eventType": "SESSION_COMPLETED",
 *   "title": "Session completed 🎉",
 *   "message": "You just completed Session 3 of Algebra Mastery.",
 *   "entity": { "type": "COURSE", "id": "<courseId>" },
 *   "payload": { "courseId": "...", "sessionId": "...", "streak": 5 },
 *   "priority": "NORMAL",
 *   "channels": ["IN_APP", "PUSH"]
 * }
 *
 * Recipient:
 * - If user token: current user (req.userId)
 * - If university token: university (not typical for MindTrain; currently we only support USER)
 */
const emitMindTrainEvent = async (req, res, next) => {
    try {
        const { eventType, title, message, entity, payload, priority, channels } = req.body || {};

        if (!eventType) {
            return res.status(400).json({
                success: false,
                message: 'eventType is required'
            });
        }

        // For now, MindTrain is user-focused. We only allow USER recipient via user token.
        if (!req.userId) {
            return res.status(400).json({
                success: false,
                message: 'MindTrain events are only supported for user tokens at the moment'
            });
        }

        await notifyMindTrainEvent({
            userId: req.userId,
            eventType,
            title,
            message,
            entity,
            payload,
            priority,
            channels
        });

        return res.status(200).json({
            success: true,
            message: 'MindTrain notification queued successfully'
        });
    } catch (error) {
        // Pass to global error handler but keep response safe
        console.error('MindTrain emitMindTrainEvent error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to emit MindTrain notification',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    emitMindTrainEvent
};
