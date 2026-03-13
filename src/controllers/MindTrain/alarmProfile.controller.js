const mindtrainUserService = require('../../services/MindTrain/mindtrainUser.service');
const { createDiagnosticLogger } = require('../../services/MindTrain/mindtrainDiagnosticLogger');
const { UserNotFoundError, DatabaseError } = require('../../utils/errors');

/**
 * POST /api/mindtrain/create-alarm-profile
 * 
 * Creates a new alarm profile and automatically deactivates all other profiles for the same user.
 * Configures FCM notification schedule (required).
 * 
 * Authentication: Required (JWT)
 */
const createAlarmProfile = async (req, res) => {
    // Create diagnostic logger for full flow tracking
    const diagLogger = createDiagnosticLogger('createAlarmProfile', {
        requestId: req.id || 'unknown',
        timestamp: new Date().toISOString()
    });

    try {
        diagLogger.start('Starting create alarm profile request');

        // Validate authentication
        if (!req.userId) {
            diagLogger.validation('Authentication check', false);
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        diagLogger.validation('Authentication check', true, { userId: req.userId.toString() });

        const { fcmConfig, ...profileData } = req.body || {};
        diagLogger.step('Request body parsed', {
            hasFcmConfig: !!fcmConfig,
            profileId: profileData?.id,
            profileTitle: profileData?.title
        });

        // Get authenticated userId from JWT token (single source of truth)
        const authenticatedUserId = req.userId.toString();
        diagLogger.userState(authenticatedUserId, 'AUTHENTICATED');

        // Validate required fields (userId not required - comes from JWT)
        const { id, youtubeUrl, title, alarmsPerDay, selectedDaysPerWeek, startTime, endTime, isActive } = profileData;

        if (!id || !title || !alarmsPerDay || !selectedDaysPerWeek || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
                errors: {
                    ...(!id && { id: 'id is required' }),
                    ...(!title && { title: 'title is required' }),
                    ...(!alarmsPerDay && { alarmsPerDay: 'alarmsPerDay is required' }),
                    ...(!selectedDaysPerWeek && { selectedDaysPerWeek: 'selectedDaysPerWeek is required' }),
                    ...(!startTime && { startTime: 'startTime is required' }),
                    ...(!endTime && { endTime: 'endTime is required' })
                }
            });
        }

        // Validate FCM config (required)
        if (!fcmConfig) {
            return res.status(400).json({
                success: false,
                message: 'fcmConfig is required',
                code: 'MISSING_FCM_CONFIG'
            });
        }

        const { morningNotificationTime, eveningNotificationTime, timezone } = fcmConfig;

        if (!morningNotificationTime || !eveningNotificationTime) {
            return res.status(400).json({
                success: false,
                message: 'morningNotificationTime and eveningNotificationTime are required',
                code: 'INVALID_FCM_CONFIG'
            });
        }

        // Validate time format (HH:mm)
        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(morningNotificationTime) || !timeRegex.test(eveningNotificationTime)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid time format. Use HH:mm format (e.g., "08:00")',
                code: 'INVALID_TIME_FORMAT'
            });
        }

        // Validate timezone (basic validation)
        if (timezone && typeof timezone !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Invalid timezone format',
                code: 'INVALID_TIMEZONE'
            });
        }

        // Ensure user exists
        diagLogger.step('Checking if MindTrain user exists');
        let user = await mindtrainUserService.getMindTrainUser(authenticatedUserId);
        if (!user) {
            diagLogger.step('User does not exist, creating new user');
            user = await mindtrainUserService.createMindTrainUser(authenticatedUserId);
            diagLogger.userState(authenticatedUserId, 'CREATED');
        } else {
            diagLogger.userState(authenticatedUserId, 'EXISTS', {
                existingProfiles: user.alarmProfiles?.length || 0
            });
        }

        // Check if profile with same id already exists
        diagLogger.step('Checking for duplicate profile ID');
        if (user.alarmProfiles && user.alarmProfiles.some(p => p.id === id)) {
            diagLogger.warn('Profile with same ID already exists', { profileId: id });
            return res.status(400).json({
                success: false,
                message: 'Profile with this id already exists',
                code: 'PROFILE_EXISTS'
            });
        }
        diagLogger.validation('Duplicate profile check', true);

        // Add profile (default isActive to false first, then activate)
        const profileToAdd = {
            ...profileData,
            isActive: false // Will be activated below
        };
        diagLogger.step('Preparing profile to add', {
            profileId: profileToAdd.id,
            isActive: profileToAdd.isActive
        });
        
        diagLogger.step('Calling addAlarmProfile service');
        let updatedUser = await mindtrainUserService.addAlarmProfile(authenticatedUserId, profileToAdd);
        diagLogger.step('Profile added successfully', {
            profileId: id,
            totalProfiles: updatedUser.alarmProfiles?.length || 0
        });

        // Auto-activate this profile and deactivate all others (as per old endpoint behavior)
        diagLogger.step('Calling activateProfile service to activate the new profile');
        updatedUser = await mindtrainUserService.activateProfile(authenticatedUserId, id);
        diagLogger.step('Profile activated successfully', {
            profileId: id,
            isActive: updatedUser.alarmProfiles?.find(p => p.id === id)?.isActive
        });

        // Verify user exists after profile activation
        if (!updatedUser) {
            diagLogger.error('User not found after profile activation');
            return res.status(500).json({
                success: false,
                message: 'User not found after profile activation',
                code: 'USER_NOT_FOUND'
            });
        }

        // Update FCM schedule timing fields (isEnabled is already set by activateProfile)
        // Note: morningNotificationTime, eveningNotificationTime, and timezone are already destructured above
        diagLogger.step('Updating FCM schedule', {
            activeProfileId: id,
            morningNotificationTime,
            eveningNotificationTime,
            timezone: timezone || 'UTC'
        });
        updatedUser = await mindtrainUserService.updateFCMSchedule(authenticatedUserId, {
            activeProfileId: id,
            morningNotificationTime,
            eveningNotificationTime,
            timezone: timezone || 'UTC'
            // Note: isEnabled is not needed here as activateProfile already sets it to true
        });

        // Find the created profile
        const createdProfile = updatedUser.alarmProfiles.find(p => p.id === id);
        if (!createdProfile) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create profile'
            });
        }

        // Get deactivated profiles for response (all profiles except the created one)
        const deactivatedProfiles = (updatedUser.alarmProfiles || [])
            .filter(p => p.id !== id && !p.isActive)
            .map(profile => ({
                id: profile.id,
                title: profile.title,
                _id: null, // Not available in nested format
                isActive: profile.isActive
            }));

        // Prepare response in old format for backward compatibility
        const response = {
            success: true,
            message: 'Alarm profile created successfully',
            data: {
                createdProfile: {
                    id: createdProfile.id,
                    userId: authenticatedUserId,
                    youtubeUrl: createdProfile.youtubeUrl,
                    title: createdProfile.title,
                    description: createdProfile.description || '',
                    alarmsPerDay: createdProfile.alarmsPerDay,
                    selectedDaysPerWeek: createdProfile.selectedDaysPerWeek,
                    startTime: createdProfile.startTime,
                    endTime: createdProfile.endTime,
                    isFixedTime: createdProfile.isFixedTime,
                    fixedTime: createdProfile.fixedTime || null,
                    specificDates: createdProfile.specificDates || null,
                    isActive: createdProfile.isActive,
                    createdAt: createdProfile.createdAt ? (createdProfile.createdAt.toISOString ? createdProfile.createdAt.toISOString() : new Date(createdProfile.createdAt).toISOString()) : new Date().toISOString(),
                    updatedAt: createdProfile.updatedAt ? (createdProfile.updatedAt.toISOString ? createdProfile.updatedAt.toISOString() : new Date(createdProfile.updatedAt).toISOString()) : new Date().toISOString(),
                    _id: null // Not available in nested format
                },
                deactivatedProfiles: deactivatedProfiles,
                deactivatedCount: deactivatedProfiles.length
            }
        };

        // Add fcmSchedule to response (always included since fcmConfig is required)
        if (updatedUser.fcmSchedule) {
            response.data.fcmSchedule = {
                userId: authenticatedUserId,
                activeProfileId: updatedUser.fcmSchedule.activeProfileId,
                morningNotificationTime: updatedUser.fcmSchedule.morningNotificationTime,
                eveningNotificationTime: updatedUser.fcmSchedule.eveningNotificationTime,
                timezone: updatedUser.fcmSchedule.timezone,
                isEnabled: updatedUser.fcmSchedule.isEnabled
            };
        }

        diagLogger.complete('Create alarm profile request completed successfully', {
            profileId: id,
            isActive: createdProfile.isActive,
            totalProfiles: updatedUser.alarmProfiles?.length || 0
        });
        diagLogger.logSummary();

        return res.status(200).json(response);
    } catch (error) {
        console.error('Create alarm profile error:', error);
        diagLogger.error('Create alarm profile failed', error, {
            errorName: error?.name,
            errorMessage: error?.message,
            errorCode: error?.code
        });
        diagLogger.logSummary();
        
        // Handle specific error types
        if (error instanceof UserNotFoundError) {
            return res.status(404).json({
                success: false,
                message: error.message,
                code: error.code || 'USER_NOT_FOUND'
            });
        }
        
        if (error instanceof DatabaseError) {
            return res.status(500).json({
                success: false,
                message: error.message,
                code: error.code || 'DATABASE_ERROR',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
        
        // Generic error handler
        return res.status(500).json({
            success: false,
            message: 'Failed to create alarm profile',
            code: 'PROFILE_CREATION_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * GET /api/mindtrain/get-alarm-profiles
 * 
 * Retrieves all alarm profiles for the authenticated user, separated into active and inactive profiles.
 * 
 * Authentication: Required (JWT)
 */
const getAlarmProfiles = async (req, res) => {
    try {
        // Validate authentication
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Optional: Validate userId query parameter if provided
        const { userId: queryUserId } = req.query || {};
        if (queryUserId && queryUserId.toString() !== req.userId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'userId query parameter must match authenticated user'
            });
        }

        // Get user data with all profiles
        let user = await mindtrainUserService.getMindTrainUser(req.userId);
        if (!user) {
            user = await mindtrainUserService.createMindTrainUser(req.userId);
        }

        // Separate profiles into active and inactive
        const activeProfiles = (user.alarmProfiles || []).filter(p => p.isActive === true);
        const inactiveProfiles = (user.alarmProfiles || []).filter(p => p.isActive === false);
        
        const result = {
            activeProfiles,
            inactiveProfiles,
            totalActive: activeProfiles.length,
            totalInactive: inactiveProfiles.length,
            totalProfiles: (user.alarmProfiles || []).length
        };

        // Format profiles for response (nested profiles don't have userId or _id at profile level)
        const formatProfile = (profile) => {
            return {
                id: profile.id,
                userId: req.userId.toString(), // From authenticated user
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
                createdAt: profile.createdAt ? (profile.createdAt.toISOString ? profile.createdAt.toISOString() : new Date(profile.createdAt).toISOString()) : new Date().toISOString(),
                updatedAt: profile.updatedAt ? (profile.updatedAt.toISOString ? profile.updatedAt.toISOString() : new Date(profile.updatedAt).toISOString()) : new Date().toISOString(),
                _id: null // Not available in nested format
            };
        };

        // Prepare response
        const response = {
            success: true,
            message: result.totalProfiles === 0 
                ? 'No alarm profiles found' 
                : 'Alarm profiles retrieved successfully',
            data: {
                activeProfiles: result.activeProfiles.map(formatProfile),
                inactiveProfiles: result.inactiveProfiles.map(formatProfile),
                totalActive: result.totalActive,
                totalInactive: result.totalInactive,
                totalProfiles: result.totalProfiles
            }
        };

        return res.status(200).json(response);
    } catch (error) {
        console.error('Get alarm profiles error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve alarm profiles',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * DELETE /api/mindtrain/alarm-profiles/:profileId
 * 
 * Deletes an alarm profile and performs cascade cleanup:
 * - Deletes FCM schedule associated with the profile
 * - Deletes notification logs for the profile
 * - Handles active profile transition (activates next profile or disables FCM)
 * 
 * Authentication: Required (JWT)
 */
const deleteAlarmProfile = async (req, res) => {
    try {
        const { profileId } = req.params;
        const userId = req.userId; // From JWT middleware

        // Validate authentication
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }

        // Validate profileId
        if (!profileId) {
            return res.status(400).json({
                success: false,
                message: 'Profile ID is required',
                code: 'PROFILE_ID_REQUIRED'
            });
        }

        // Get user to check if profile exists and get profile info
        const user = await mindtrainUserService.getMindTrainUser(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        const profile = user.alarmProfiles?.find(p => p.id === profileId);
        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found',
                code: 'PROFILE_NOT_FOUND'
            });
        }

        const wasActive = profile.isActive || false;

        // Delete the profile (service handles FCM schedule cleanup automatically)
        const updatedUser = await mindtrainUserService.deleteAlarmProfile(userId, profileId);

        // Get remaining profiles count
        const remainingCount = (updatedUser.alarmProfiles || []).length;

        // Check if FCM schedule was cleared (if deleted profile was active)
        const fcmScheduleCleared = wasActive && !updatedUser.fcmSchedule?.activeProfileId;

        return res.status(200).json({
            success: true,
            message: 'Profile deleted successfully',
            data: {
                deletedProfileId: profileId,
                cascadeCleanup: {
                    fcmScheduleDeleted: fcmScheduleCleared,
                    notificationLogsDeleted: 0, // Notification logs are in nested array, not separate collection
                    remainingProfiles: remainingCount,
                    fcmDisabled: fcmScheduleCleared && remainingCount === 0,
                },
            },
        });
    } catch (error) {
        console.error('[Delete] Error:', error.message);
        console.error('[Delete] Stack:', error.stack);

        return res.status(500).json({
            success: false,
            message: 'Failed to delete profile',
            code: 'DELETE_FAILED',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * POST /api/mindtrain/activate-alarm-profile
 * 
 * Activates an existing alarm profile and automatically deactivates all other profiles for the same user.
 * Updates FCM schedule to enable notifications for the activated profile.
 * 
 * Can also update profile fields if provided in the request body.
 * 
 * Authentication: Required (JWT)
 */
const activateAlarmProfile = async (req, res) => {
    // Create diagnostic logger for full flow tracking
    const diagLogger = createDiagnosticLogger('activateAlarmProfile', {
        requestId: req.id || 'unknown',
        timestamp: new Date().toISOString()
    });

    try {
        diagLogger.start('Starting activate alarm profile request');

        // Validate authentication
        if (!req.userId) {
            diagLogger.validation('Authentication check', false);
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        diagLogger.validation('Authentication check', true, { userId: req.userId.toString() });

        const { profileId, isActive, ...otherFields } = req.body || {};
        diagLogger.step('Request body parsed', {
            profileId: profileId,
            isActive: isActive,
            otherFieldsCount: Object.keys(otherFields).length
        });

        // Get authenticated userId from JWT token (single source of truth)
        const authenticatedUserId = req.userId.toString();
        diagLogger.userState(authenticatedUserId, 'AUTHENTICATED');

        // Validate required fields
        if (!profileId) {
            diagLogger.validation('profileId required', false);
            return res.status(400).json({
                success: false,
                message: 'profileId is required',
                code: 'MISSING_PROFILE_ID'
            });
        }

        if (isActive === undefined) {
            diagLogger.validation('isActive required', false);
            return res.status(400).json({
                success: false,
                message: 'isActive is required',
                code: 'MISSING_IS_ACTIVE'
            });
        }

        if (typeof isActive !== 'boolean') {
            diagLogger.validation('isActive must be boolean', false);
            return res.status(400).json({
                success: false,
                message: 'isActive must be a boolean',
                code: 'INVALID_IS_ACTIVE_TYPE'
            });
        }

        if (isActive !== true) {
            diagLogger.validation('isActive must be true', false);
            return res.status(400).json({
                success: false,
                message: 'isActive must be true. Use delete endpoint to deactivate profiles.',
                code: 'INVALID_IS_ACTIVE_VALUE'
            });
        }

        diagLogger.validation('Required fields validation', true);

        // Check if profile exists
        diagLogger.step('Checking if profile exists');
        const user = await mindtrainUserService.getMindTrainUser(authenticatedUserId);
        if (!user) {
            diagLogger.warn('User not found', { userId: authenticatedUserId });
            return res.status(404).json({
                success: false,
                message: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        const profile = user.alarmProfiles?.find(p => p.id === profileId);
        if (!profile) {
            diagLogger.warn('Profile not found', { profileId });
            return res.status(404).json({
                success: false,
                message: 'Profile not found',
                code: 'PROFILE_NOT_FOUND'
            });
        }
        diagLogger.step('Profile found', {
            profileId: profileId,
            currentIsActive: profile.isActive,
            fieldsToUpdate: Object.keys(otherFields).length
        });

        // Determine if we need to update fields or just activate
        let updatedUser;
        if (Object.keys(otherFields).length > 0) {
            // Has optional fields - use updateAlarmProfile service (handles activation + field updates)
            diagLogger.step('Optional fields provided, calling updateAlarmProfile service');
            const updates = {
                isActive: true,
                ...otherFields
            };
            updatedUser = await mindtrainUserService.updateAlarmProfile(authenticatedUserId, profileId, updates);
            diagLogger.step('Profile updated and activated successfully', {
                profileId: profileId,
                isActive: updatedUser.alarmProfiles?.find(p => p.id === profileId)?.isActive,
                fieldsUpdated: Object.keys(otherFields).length
            });
        } else {
            // No optional fields - just activate
            diagLogger.step('No optional fields, calling activateProfile service to activate the profile');
            updatedUser = await mindtrainUserService.activateProfile(authenticatedUserId, profileId);
            diagLogger.step('Profile activated successfully', {
                profileId: profileId,
                isActive: updatedUser.alarmProfiles?.find(p => p.id === profileId)?.isActive
            });
        }

        // Find the activated profile
        const activatedProfile = updatedUser.alarmProfiles.find(p => p.id === profileId);
        if (!activatedProfile) {
            return res.status(500).json({
                success: false,
                message: 'Failed to activate profile'
            });
        }

        // Get deactivated profiles for response (all profiles except the activated one)
        const deactivatedProfiles = (updatedUser.alarmProfiles || [])
            .filter(p => p.id !== profileId && !p.isActive)
            .map(profile => ({
                id: profile.id,
                title: profile.title,
                _id: null, // Not available in nested format
                isActive: profile.isActive
            }));

        // Format activated profile for response
        const formatProfile = (profile) => {
            return {
                id: profile.id,
                userId: authenticatedUserId,
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
                createdAt: profile.createdAt ? (profile.createdAt.toISOString ? profile.createdAt.toISOString() : new Date(profile.createdAt).toISOString()) : new Date().toISOString(),
                updatedAt: profile.updatedAt ? (profile.updatedAt.toISOString ? profile.updatedAt.toISOString() : new Date(profile.updatedAt).toISOString()) : new Date().toISOString(),
                _id: null // Not available in nested format
            };
        };

        // Prepare response message based on whether fields were updated
        const hasFieldUpdates = Object.keys(otherFields).length > 0;
        const responseMessage = hasFieldUpdates 
            ? 'Alarm profile updated and activated successfully'
            : 'Alarm profile activated successfully';

        // Prepare response
        const response = {
            success: true,
            message: responseMessage,
            data: {
                activatedProfile: formatProfile(activatedProfile),
                deactivatedProfiles: deactivatedProfiles,
                deactivatedCount: deactivatedProfiles.length
            }
        };

        // Add fcmSchedule to response
        if (updatedUser.fcmSchedule) {
            response.data.fcmSchedule = {
                userId: authenticatedUserId,
                activeProfileId: updatedUser.fcmSchedule.activeProfileId,
                morningNotificationTime: updatedUser.fcmSchedule.morningNotificationTime,
                eveningNotificationTime: updatedUser.fcmSchedule.eveningNotificationTime,
                timezone: updatedUser.fcmSchedule.timezone,
                isEnabled: updatedUser.fcmSchedule.isEnabled
            };
        }

        diagLogger.complete('Activate alarm profile request completed successfully', {
            profileId: profileId,
            isActive: activatedProfile.isActive,
            fieldsUpdated: Object.keys(otherFields).length,
            totalProfiles: updatedUser.alarmProfiles?.length || 0
        });
        diagLogger.logSummary();

        return res.status(200).json(response);
    } catch (error) {
        console.error('Activate alarm profile error:', error);
        diagLogger.error('Activate alarm profile failed', error, {
            errorName: error?.name,
            errorMessage: error?.message,
            errorCode: error?.code
        });
        diagLogger.logSummary();
        
        return res.status(500).json({
            success: false,
            message: 'Failed to activate alarm profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createAlarmProfile,
    getAlarmProfiles,
    activateAlarmProfile,
    deleteAlarmProfile
};

