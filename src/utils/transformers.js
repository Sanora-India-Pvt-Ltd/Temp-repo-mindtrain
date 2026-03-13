/**
 * Data Transformers for MindTrain
 * 
 * Converts between old format (separate collections) and new format (unified MindTrainUser).
 * Maintains 100% backward compatibility with existing API responses.
 */

/**
 * Transform old AlarmProfile format to new nested format
 * @param {Object} oldProfile - Old AlarmProfile document
 * @returns {Object} New nested profile format
 */
const transformOldProfileToNew = (oldProfile) => {
    if (!oldProfile) return null;

    // Extract fields that should be in the nested profile
    const {
        id,
        youtubeUrl,
        title,
        description = '',
        alarmsPerDay,
        selectedDaysPerWeek,
        startTime,
        endTime,
        isFixedTime = false,
        fixedTime = null,
        specificDates = null,
        isActive = false,
        lastSyncTimestamp = null,
        lastSyncSource = null,
        syncHealthScore = 100,
        lastSyncStatus = 'pending',
        nextSyncCheckTime = null,
        deviceSyncStatus = [],
        createdAt,
        updatedAt
    } = oldProfile;

    return {
        id: String(id).trim(),
        youtubeUrl: youtubeUrl ? String(youtubeUrl).trim() : null,
        title: String(title).trim(),
        description: String(description || '').trim(),
        alarmsPerDay: Number(alarmsPerDay),
        selectedDaysPerWeek: Array.isArray(selectedDaysPerWeek) ? selectedDaysPerWeek : [],
        startTime: String(startTime).trim(),
        endTime: String(endTime).trim(),
        isFixedTime: Boolean(isFixedTime),
        fixedTime: fixedTime ? String(fixedTime).trim() : null,
        specificDates: specificDates ? specificDates.map(d => String(d)) : null,
        isActive: Boolean(isActive),
        lastSyncTimestamp: lastSyncTimestamp ? new Date(lastSyncTimestamp) : null,
        lastSyncSource: lastSyncSource || null,
        syncHealthScore: Number(syncHealthScore) || 100,
        lastSyncStatus: lastSyncStatus || 'pending',
        nextSyncCheckTime: nextSyncCheckTime ? new Date(nextSyncCheckTime) : null,
        deviceSyncStatus: Array.isArray(deviceSyncStatus) ? deviceSyncStatus.map(device => ({
            deviceId: String(device.deviceId || device.id || '').trim(),
            lastSyncAt: device.lastSyncAt ? new Date(device.lastSyncAt) : new Date(),
            syncStatus: device.syncStatus || 'pending',
            lastError: device.lastError || null
        })) : [],
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        updatedAt: updatedAt ? new Date(updatedAt) : new Date()
    };
};

/**
 * Transform new nested profile format to old AlarmProfile format
 * @param {Object} newProfile - New nested profile
 * @param {string|ObjectId} userId - User ID (required for old format)
 * @returns {Object} Old AlarmProfile format
 */
const transformNewProfileToOld = (newProfile, userId) => {
    if (!newProfile) return null;

    const {
        id,
        youtubeUrl,
        title,
        description,
        alarmsPerDay,
        selectedDaysPerWeek,
        startTime,
        endTime,
        isFixedTime,
        fixedTime,
        specificDates,
        isActive,
        lastSyncTimestamp,
        lastSyncSource,
        syncHealthScore,
        lastSyncStatus,
        nextSyncCheckTime,
        deviceSyncStatus,
        createdAt,
        updatedAt
    } = newProfile;

    return {
        _id: newProfile._id || null, // May not exist in nested format
        id: String(id).trim(),
        userId: userId ? (typeof userId === 'object' && userId.toString ? userId.toString() : String(userId)) : null,
        youtubeUrl: youtubeUrl ? String(youtubeUrl).trim() : null,
        title: String(title).trim(),
        description: String(description || '').trim(),
        alarmsPerDay: Number(alarmsPerDay),
        selectedDaysPerWeek: Array.isArray(selectedDaysPerWeek) ? selectedDaysPerWeek : [],
        startTime: String(startTime).trim(),
        endTime: String(endTime).trim(),
        isFixedTime: Boolean(isFixedTime),
        fixedTime: fixedTime ? String(fixedTime).trim() : null,
        specificDates: specificDates ? specificDates.map(d => String(d)) : null,
        isActive: Boolean(isActive),
        lastSyncTimestamp: lastSyncTimestamp ? new Date(lastSyncTimestamp) : null,
        lastSyncSource: lastSyncSource || null,
        syncHealthScore: Number(syncHealthScore) || 100,
        lastSyncStatus: lastSyncStatus || 'pending',
        nextSyncCheckTime: nextSyncCheckTime ? new Date(nextSyncCheckTime) : null,
        deviceSyncStatus: Array.isArray(deviceSyncStatus) ? deviceSyncStatus : [],
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        updatedAt: updatedAt ? new Date(updatedAt) : new Date()
    };
};

/**
 * Transform old FCMSchedule format to new nested format
 * @param {Object} oldSchedule - Old FCMSchedule document
 * @returns {Object} New nested FCM schedule format
 */
const transformOldFCMToNew = (oldSchedule) => {
    if (!oldSchedule) {
        return {
            activeProfileId: null,
            morningNotificationTime: '08:00',
            eveningNotificationTime: '20:00',
            timezone: 'UTC',
            isEnabled: false,
            lastSentAt: null,
            nextMorningNotification: null,
            nextEveningNotification: null,
            deliveryRetries: 0,
            failureReason: null,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    const {
        activeProfileId,
        morningNotificationTime = '08:00',
        eveningNotificationTime = '20:00',
        timezone = 'UTC',
        isEnabled = false,
        lastSentAt = null,
        nextMorningNotification = null,
        nextEveningNotification = null,
        deliveryRetries = 0,
        failureReason = null,
        createdAt,
        updatedAt
    } = oldSchedule;

    return {
        activeProfileId: activeProfileId ? String(activeProfileId).trim() : null,
        morningNotificationTime: String(morningNotificationTime).trim(),
        eveningNotificationTime: String(eveningNotificationTime).trim(),
        timezone: String(timezone).trim(),
        isEnabled: Boolean(isEnabled),
        lastSentAt: lastSentAt ? new Date(lastSentAt) : null,
        nextMorningNotification: nextMorningNotification ? new Date(nextMorningNotification) : null,
        nextEveningNotification: nextEveningNotification ? new Date(nextEveningNotification) : null,
        deliveryRetries: Number(deliveryRetries) || 0,
        failureReason: failureReason ? String(failureReason).trim() : null,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        updatedAt: updatedAt ? new Date(updatedAt) : new Date()
    };
};

/**
 * Transform new nested FCM schedule format to old FCMSchedule format
 * @param {Object} newSchedule - New nested FCM schedule
 * @param {string|ObjectId} userId - User ID (required for old format)
 * @returns {Object} Old FCMSchedule format
 */
const transformNewFCMToOld = (newSchedule, userId) => {
    if (!newSchedule) return null;

    const {
        activeProfileId,
        morningNotificationTime,
        eveningNotificationTime,
        timezone,
        isEnabled,
        lastSentAt,
        nextMorningNotification,
        nextEveningNotification,
        deliveryRetries,
        failureReason,
        createdAt,
        updatedAt
    } = newSchedule;

    return {
        _id: newSchedule._id || null, // May not exist in nested format
        userId: userId,
        activeProfileId: activeProfileId ? String(activeProfileId).trim() : null,
        morningNotificationTime: String(morningNotificationTime || '08:00').trim(),
        eveningNotificationTime: String(eveningNotificationTime || '20:00').trim(),
        timezone: String(timezone || 'UTC').trim(),
        isEnabled: Boolean(isEnabled),
        lastSentAt: lastSentAt ? new Date(lastSentAt) : null,
        nextMorningNotification: nextMorningNotification ? new Date(nextMorningNotification) : null,
        nextEveningNotification: nextEveningNotification ? new Date(nextEveningNotification) : null,
        deliveryRetries: Number(deliveryRetries) || 0,
        failureReason: failureReason ? String(failureReason).trim() : null,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        updatedAt: updatedAt ? new Date(updatedAt) : new Date()
    };
};

/**
 * Transform old NotificationLog format to new nested format
 * @param {Object} oldLog - Old NotificationLog document
 * @returns {Object} New nested notification log format
 */
const transformOldNotificationToNew = (oldLog) => {
    if (!oldLog) return null;

    const {
        notificationId,
        type = 'sync_trigger',
        scheduledTime = null,
        sentAt = null,
        deliveredAt = null,
        openedAt = null,
        failedAt = null,
        status = 'pending',
        deliveryError = null,
        deliveryRetries = 0,
        title = null,
        body = null,
        data = {},
        deviceId = null,
        fcmToken = null,
        createdAt,
        updatedAt
    } = oldLog;

    return {
        notificationId: String(notificationId).trim(),
        type: type || 'sync_trigger',
        scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
        sentAt: sentAt ? new Date(sentAt) : null,
        deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
        openedAt: openedAt ? new Date(openedAt) : null,
        failedAt: failedAt ? new Date(failedAt) : null,
        status: status || 'pending',
        deliveryError: deliveryError ? String(deliveryError).trim() : null,
        deliveryRetries: Number(deliveryRetries) || 0,
        title: title ? String(title).trim() : null,
        body: body ? String(body).trim() : null,
        data: {
            profileId: data.profileId ? String(data.profileId) : null,
            syncSource: data.syncSource ? String(data.syncSource) : null,
            reason: data.reason ? String(data.reason) : null
        },
        deviceId: deviceId ? String(deviceId).trim() : null,
        fcmToken: fcmToken ? String(fcmToken).trim() : null,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        updatedAt: updatedAt ? new Date(updatedAt) : new Date()
    };
};

/**
 * Transform old SyncHealthLog format to new nested format
 * @param {Object} oldLog - Old SyncHealthLog document
 * @returns {Object} New nested sync health log format
 */
const transformOldHealthToNew = (oldLog) => {
    if (!oldLog) return null;

    const {
        deviceId,
        reportedAt,
        lastWorkManagerCheck = null,
        workManagerStatus = 'not_ran',
        lastFCMReceived = null,
        fcmStatus = 'not_received',
        missedAlarmsCount = 0,
        missedAlarmsReason = null,
        dozeMode = false,
        batteryLevel = null,
        networkConnectivity = null,
        healthScore = 100,
        appVersion = null,
        osVersion = null,
        notes = null,
        createdAt,
        updatedAt
    } = oldLog;

    return {
        deviceId: String(deviceId).trim(),
        reportedAt: reportedAt ? new Date(reportedAt) : new Date(),
        lastWorkManagerCheck: lastWorkManagerCheck ? new Date(lastWorkManagerCheck) : null,
        workManagerStatus: workManagerStatus || 'not_ran',
        lastFCMReceived: lastFCMReceived ? new Date(lastFCMReceived) : null,
        fcmStatus: fcmStatus || 'not_received',
        missedAlarmsCount: Number(missedAlarmsCount) || 0,
        missedAlarmsReason: missedAlarmsReason || null,
        dozeMode: Boolean(dozeMode),
        batteryLevel: batteryLevel !== null && batteryLevel !== undefined ? Number(batteryLevel) : null,
        networkConnectivity: networkConnectivity || null,
        healthScore: Number(healthScore) || 100,
        appVersion: appVersion ? String(appVersion).trim() : null,
        osVersion: osVersion ? String(osVersion).trim() : null,
        notes: notes ? String(notes).trim() : null,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        updatedAt: updatedAt ? new Date(updatedAt) : new Date()
    };
};

/**
 * Response formatter class for maintaining backward compatibility
 */
class ResponseFormatter {
    /**
     * Format alarm profiles response (old format)
     * @param {Object} user - MindTrainUser document
     * @returns {Object} Formatted response matching old API format
     */
    static formatAlarmProfilesResponse(user) {
        if (!user || !user.alarmProfiles) {
            return {
                success: true,
                message: 'No alarm profiles found',
                data: {
                    activeProfiles: [],
                    inactiveProfiles: [],
                    totalActive: 0,
                    totalInactive: 0,
                    totalProfiles: 0
                }
            };
        }

        const activeProfiles = user.alarmProfiles.filter(p => p.isActive === true);
        const inactiveProfiles = user.alarmProfiles.filter(p => p.isActive === false);

        const formatProfile = (profile) => ({
            id: profile.id,
            userId: user.userId.toString(),
            youtubeUrl: profile.youtubeUrl,
            title: profile.title,
            description: profile.description || '',
            alarmsPerDay: profile.alarmsPerDay,
            selectedDaysPerWeek: profile.selectedDaysPerWeek,
            startTime: profile.startTime,
            endTime: profile.endTime,
            isFixedTime: profile.isFixedTime,
            fixedTime: profile.fixedTime || null,
            specificDates: profile.specificDates || null,
            isActive: profile.isActive,
            createdAt: profile.createdAt ? new Date(profile.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: profile.updatedAt ? new Date(profile.updatedAt).toISOString() : new Date().toISOString(),
            _id: profile._id ? profile._id.toString() : null
        });

        return {
            success: true,
            message: user.alarmProfiles.length === 0 
                ? 'No alarm profiles found' 
                : 'Alarm profiles retrieved successfully',
            data: {
                activeProfiles: activeProfiles.map(formatProfile),
                inactiveProfiles: inactiveProfiles.map(formatProfile),
                totalActive: activeProfiles.length,
                totalInactive: inactiveProfiles.length,
                totalProfiles: user.alarmProfiles.length
            }
        };
    }

    /**
     * Format FCM schedule response (old format)
     * @param {Object} user - MindTrainUser document
     * @returns {Object} Formatted response matching old API format
     */
    static formatFCMScheduleResponse(user) {
        if (!user || !user.fcmSchedule) {
            return {
                success: true,
                message: 'FCM schedule not found',
                data: null
            };
        }

        const schedule = user.fcmSchedule;
        return {
            success: true,
            message: 'FCM schedule retrieved successfully',
            data: {
                _id: schedule._id ? schedule._id.toString() : null,
                userId: user.userId.toString(),
                activeProfileId: schedule.activeProfileId || null,
                morningNotificationTime: schedule.morningNotificationTime || '08:00',
                eveningNotificationTime: schedule.eveningNotificationTime || '20:00',
                timezone: schedule.timezone || 'UTC',
                isEnabled: schedule.isEnabled || false,
                lastSentAt: schedule.lastSentAt ? new Date(schedule.lastSentAt).toISOString() : null,
                nextMorningNotification: schedule.nextMorningNotification 
                    ? new Date(schedule.nextMorningNotification).toISOString() 
                    : null,
                nextEveningNotification: schedule.nextEveningNotification 
                    ? new Date(schedule.nextEveningNotification).toISOString() 
                    : null,
                deliveryRetries: schedule.deliveryRetries || 0,
                failureReason: schedule.failureReason || null,
                createdAt: schedule.createdAt ? new Date(schedule.createdAt).toISOString() : new Date().toISOString(),
                updatedAt: schedule.updatedAt ? new Date(schedule.updatedAt).toISOString() : new Date().toISOString()
            }
        };
    }
}

module.exports = {
    transformOldProfileToNew,
    transformNewProfileToOld,
    transformOldFCMToNew,
    transformNewFCMToOld,
    transformOldNotificationToNew,
    transformOldHealthToNew,
    ResponseFormatter
};

