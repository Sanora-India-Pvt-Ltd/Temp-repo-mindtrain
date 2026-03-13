const MindTrainUser = require('../../models/MindTrain/MindTrainUser');
const mongoose = require('mongoose');
const { getMindTrainConnection } = require('../../config/dbMindTrain');
const logger = require('../../utils/logger').child({ component: 'MindTrainUserService' });
const metrics = require('../../utils/metrics');
const {
    UserNotFoundError,
    ProfileNotFoundError,
    ValidationError,
    DatabaseError,
    ConcurrencyError
} = require('../../utils/errors');
const config = require('../../config/mindtrain.config');
const { createDiagnosticLogger } = require('./mindtrainDiagnosticLogger');

/**
 * MindTrain User Service
 * 
 * Handles all business logic for the unified MindTrainUser model.
 * Provides methods for managing alarm profiles, FCM schedules, notification logs, and sync health logs.
 * 
 * All operations use atomic MongoDB updates for data consistency.
 * Includes comprehensive error handling, logging, and metrics tracking.
 */

/**
 * Get complete user data (all-in-one)
 * Returns the complete nested document with all user data
 * Frontend computes health status and statistics from this data
 * 
 * @param {string|ObjectId} userId - User ID
 * @returns {Promise<Object|null>} Complete MindTrainUser document or null if not found
 */
const getMindTrainUser = async (userId) => {
    const operationLogger = logger.child({ operation: 'getMindTrainUser', userId });
    
    return await metrics.record('mindtrain_user_get', async () => {
        try {
            if (!userId) {
                throw new ValidationError('userId is required');
            }

            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;

            operationLogger.debug('Fetching MindTrain user');

            const user = await MindTrainUser.findOne({ userId: userIdObjectId })
                .lean()
                .exec();

            if (!user) {
                operationLogger.debug('User not found');
                return null;
            }

            operationLogger.info('User retrieved successfully', {
                profilesCount: user.alarmProfiles?.length || 0,
                notificationsCount: user.notificationLogs?.length || 0
            });

            return user;
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            operationLogger.error('Error getting MindTrain user', error, { userId });
            throw new DatabaseError('Failed to retrieve MindTrain user', error);
        }
    }, { operation: 'get' });
};

/**
 * Initialize a new MindTrainUser document
 * Creates a new document with default values
 * 
 * @param {string|ObjectId} userId - User ID
 * @returns {Promise<Object>} Created MindTrainUser document
 */
const createMindTrainUser = async (userId) => {
    const operationLogger = logger.child({ operation: 'createMindTrainUser', userId });
    
    return await metrics.record('mindtrain_user_create', async () => {
        try {
            if (!userId) {
                throw new ValidationError('userId is required');
            }

            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;

            // Check if user already exists
            const existing = await MindTrainUser.findOne({ userId: userIdObjectId }).lean();
            if (existing) {
                operationLogger.warn('User already exists, returning existing user');
                return existing;
            }

            operationLogger.debug('Creating new MindTrain user');

            const user = new MindTrainUser({
                userId: userIdObjectId,
                alarmProfiles: [],
                fcmSchedule: {
                    morningNotificationTime: '08:00',
                    eveningNotificationTime: '20:00',
                    timezone: 'UTC',
                    isEnabled: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                notificationLogs: [],
                syncHealthLogs: [],
                metadata: {
                    totalAlarmProfiles: 0,
                    activeAlarmProfiles: 0,
                    totalNotifications: 0,
                    totalSyncHealthLogs: 0
                }
            });

            await user.save();
            
            operationLogger.info('MindTrain user created successfully');
            metrics.increment('mindtrain_user_created', 1);
            
            return user.toObject();
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            operationLogger.error('Error creating MindTrain user', error, { userId });
            throw new DatabaseError('Failed to create MindTrain user', error);
        }
    }, { operation: 'create' });
};

/**
 * Add a new alarm profile
 * Creates a new profile in the alarmProfiles array
 * Auto-updates metadata
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {Object} profileData - Alarm profile data
 * @returns {Promise<Object>} Updated MindTrainUser document
 */
const addAlarmProfile = async (userId, profileData) => {
    const operationLogger = logger.child({ 
        operation: 'addAlarmProfile', 
        userId, 
        profileId: profileData?.id 
    });
    
    // Create diagnostic logger
    const diagLogger = createDiagnosticLogger('addAlarmProfile', { userId, profileId: profileData?.id });
    
    return await metrics.record('mindtrain_profile_add', async () => {
        try {
            diagLogger.start('Starting alarm profile addition');

            if (!userId) {
                diagLogger.validation('userId required', false);
                throw new ValidationError('userId is required');
            }
            if (!profileData || !profileData.id) {
                diagLogger.validation('profileData with id required', false, { hasProfileData: !!profileData, hasId: !!profileData?.id });
                throw new ValidationError('profileData with id is required');
            }
            diagLogger.validation('Input validation', true);

            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;
            diagLogger.step('User ID converted to ObjectId', { userIdObjectId: userIdObjectId.toString() });

            // Check if profile with same id already exists
            diagLogger.step('Checking for existing profile with same ID');
            const existingUser = await MindTrainUser.findOne({
                userId: userIdObjectId,
                'alarmProfiles.id': profileData.id
            }).lean();

            diagLogger.mongoOperation('findOne (duplicate check)', existingUser, {
                userId: userIdObjectId.toString(),
                profileId: profileData.id
            });

            if (existingUser) {
                diagLogger.warn('Profile with same id already exists', { profileId: profileData.id });
                throw new ValidationError(`Profile with id '${profileData.id}' already exists`);
            }
            diagLogger.validation('Duplicate profile check', true);

            // Check profile limit
            diagLogger.step('Checking profile limit');
            const user = await MindTrainUser.findOne({ userId: userIdObjectId }).lean();
            diagLogger.mongoOperation('findOne (profile limit check)', user, {
                userId: userIdObjectId.toString()
            });

            if (user && user.alarmProfiles && user.alarmProfiles.length >= config.MAX_ALARM_PROFILES) {
                diagLogger.warn('Profile limit exceeded', {
                    currentCount: user.alarmProfiles.length,
                    maxAllowed: config.MAX_ALARM_PROFILES
                });
                throw new ValidationError(`Maximum ${config.MAX_ALARM_PROFILES} alarm profiles allowed`);
            }
            diagLogger.validation('Profile limit check', true, {
                currentCount: user?.alarmProfiles?.length || 0,
                maxAllowed: config.MAX_ALARM_PROFILES
            });

            const now = new Date();
            const newProfile = {
                ...profileData,
                createdAt: now,
                updatedAt: now
            };
            diagLogger.step('Profile data prepared', {
                profileId: newProfile.id,
                title: newProfile.title,
                isActive: newProfile.isActive
            });

            diagLogger.step('Executing findOneAndUpdate to add profile');
            const updatedUser = await MindTrainUser.findOneAndUpdate(
                { userId: userIdObjectId },
                {
                    $push: { alarmProfiles: newProfile },
                    $set: {
                        'metadata.lastProfileUpdateAt': now,
                        updatedAt: now
                    }
                },
                { new: true, upsert: false }
            ).exec();

            diagLogger.mongoOperation('findOneAndUpdate (add profile)', updatedUser, {
                operation: 'push_alarm_profile',
                userId: userIdObjectId.toString(),
                profileId: profileData.id
            });

            if (!updatedUser) {
                diagLogger.error('User not found during profile addition', null, {
                    userId: userIdObjectId.toString()
                });
                throw new UserNotFoundError(userId);
            }

            // Verify profile was added
            const addedProfile = updatedUser.alarmProfiles?.find(p => p.id === profileData.id);
            if (!addedProfile) {
                diagLogger.error('CRITICAL: Profile not found in result after addition', null, {
                    profileId: profileData.id,
                    totalProfiles: updatedUser.alarmProfiles?.length || 0
                });
                throw new DatabaseError(`Failed to add profile: Profile not found in result`);
            }

            diagLogger.profileState(profileData.id, 'ADDED', {
                isActive: addedProfile.isActive,
                totalProfiles: updatedUser.alarmProfiles.length
            });

            // FIX: Remove redundant save() call - findOneAndUpdate already saves
            // Pre-save middleware will run on next save, but we don't need it here
            // as metadata is already updated in the $set operation
            // Only call save() if we need to trigger middleware for other purposes
            // For now, we skip it to avoid potential validation issues
            
            // Note: If pre-save middleware is critical, we can call save() conditionally
            // But since we're already updating metadata in $set, it's redundant
            diagLogger.step('Skipping redundant save() call - findOneAndUpdate already persisted changes');

            operationLogger.info('Alarm profile added successfully', { profileId: profileData.id });
            metrics.increment('mindtrain_profile_added', 1);

            diagLogger.complete('Profile addition completed successfully', {
                profileId: profileData.id,
                totalProfiles: updatedUser.alarmProfiles.length,
                isActive: addedProfile.isActive
            });
            diagLogger.logSummary();

            return updatedUser.toObject();
        } catch (error) {
            if (error instanceof ValidationError || error instanceof UserNotFoundError) {
                diagLogger.error('Known error type', error);
                throw error;
            }
            operationLogger.error('Error adding alarm profile', error, { userId, profileId: profileData?.id });
            diagLogger.error('Unknown error type', error);
            diagLogger.logSummary();
            throw new DatabaseError('Failed to add alarm profile', error);
        }
    }, { operation: 'add_profile' });
};

/**
 * Update an alarm profile
 * Updates specific profile fields using array filters
 * Supports partial updates (only update what's provided)
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {string} profileId - Profile ID
 * @param {Object} updates - Partial profile updates
 * @returns {Promise<Object>} Updated MindTrainUser document
 */
const updateAlarmProfile = async (userId, profileId, updates) => {
    const operationLogger = logger.child({ 
        operation: 'updateAlarmProfile', 
        userId, 
        profileId 
    });
    
    return await metrics.record('mindtrain_profile_update', async () => {
        try {
            if (!userId || !profileId) {
                throw new ValidationError('userId and profileId are required');
            }
            if (!updates || Object.keys(updates).length === 0) {
                throw new ValidationError('updates object is required');
            }

            // Validate required field: isActive
            if (updates.isActive === undefined) {
                throw new ValidationError('isActive is required');
            }

            // Since isActive is always true from frontend, always trigger unified activation flow
            if (updates.isActive === true) {
                // Extract other fields to update (excluding isActive as it's handled by activateProfile)
                const { isActive, ...otherFields } = updates;
                
                // First, activate the profile (unified flow)
                let updatedUser = await activateProfile(userId, profileId);
                
                // Update other fields if provided
                if (Object.keys(otherFields).length > 0) {
            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;

            const updateFields = {};
            const now = new Date();

            // Build update object for array element
                    Object.keys(otherFields).forEach(key => {
                if (key !== 'id' && key !== 'createdAt') {
                            updateFields[`alarmProfiles.$.${key}`] = otherFields[key];
                }
            });

            // Always update updatedAt
            updateFields['alarmProfiles.$.updatedAt'] = now;
            updateFields['metadata.lastProfileUpdateAt'] = now;
            updateFields['updatedAt'] = now;

                    operationLogger.debug('Updating other profile fields after activation');

            const user = await MindTrainUser.findOneAndUpdate(
                {
                    userId: userIdObjectId,
                    'alarmProfiles.id': profileId
                },
                { $set: updateFields },
                { new: true }
            ).exec();

            if (!user) {
                throw new ProfileNotFoundError(profileId);
            }

            // Metadata will be auto-calculated by pre-save middleware
            await user.save();

                    updatedUser = user.toObject();
                }

                operationLogger.info('Alarm profile updated and activated successfully', { profileId });
            metrics.increment('mindtrain_profile_updated', 1);

                return updatedUser;
            } else {
                // Note: isActive: false case should not happen from frontend,
                // but if it does, handle accordingly (deactivate logic)
                // For now, throw validation error
                throw new ValidationError('isActive must be true. Use delete endpoint to deactivate profiles.');
            }
        } catch (error) {
            if (error instanceof ValidationError || error instanceof ProfileNotFoundError || error instanceof DatabaseError) {
                throw error;
            }
            operationLogger.error('Error updating alarm profile', error, { userId, profileId });
            throw new DatabaseError('Failed to update alarm profile', error);
        }
    }, { operation: 'update_profile' });
};

/**
 * Activate a profile
 * Sets specified profile as active (isActive = true)
 * Automatically deactivates all other profiles (isActive = false)
 * Updates fcmSchedule.activeProfileId
 * Atomic operation (all-or-nothing) using MongoDB transaction
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {string} profileId - Profile ID to activate
 * @returns {Promise<Object>} Updated MindTrainUser document
 */
const activateProfile = async (userId, profileId) => {
    const operationLogger = logger.child({ 
        operation: 'activateProfile', 
        userId, 
        profileId 
    });
    
    // Create diagnostic logger for detailed debugging
    const diagLogger = createDiagnosticLogger('activateProfile', { userId, profileId });
    
    return await metrics.record('mindtrain_profile_activate', async () => {
        try {
            diagLogger.start('Starting profile activation');

            if (!userId || !profileId) {
                diagLogger.validation('userId and profileId required', false, { userId: !!userId, profileId: !!profileId });
                throw new ValidationError('userId and profileId are required');
            }
            diagLogger.validation('userId and profileId required', true);

            const mindTrainConnection = getMindTrainConnection();
            if (!mindTrainConnection) {
                diagLogger.error('MindTrain database connection not initialized');
                throw new DatabaseError('MindTrain database connection not initialized');
            }
            diagLogger.step('Database connection verified');

            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;
            diagLogger.step('User ID converted to ObjectId', { userIdObjectId: userIdObjectId.toString() });

            const session = await mindTrainConnection.startSession();
            session.startTransaction();
            diagLogger.transactionState('STARTED', { sessionId: session.id?.toString() });

            try {
                // First, verify the profile exists
                diagLogger.step('Checking if profile exists before transaction');
                const user = await MindTrainUser.findOne({
                    userId: userIdObjectId,
                    'alarmProfiles.id': profileId
                }).session(session).exec();

                diagLogger.mongoOperation('findOne (profile existence check)', user, {
                    userId: userIdObjectId.toString(),
                    profileId
                });

                if (!user) {
                    diagLogger.warn('Profile not found, aborting transaction', { userId, profileId });
                    await session.abortTransaction();
                    session.endSession();
                    diagLogger.transactionState('ABORTED', { reason: 'Profile not found' });
                    throw new ProfileNotFoundError(profileId);
                }

                // Log current profile state
                const currentProfile = user.alarmProfiles?.find(p => p.id === profileId);
                const allProfiles = user.alarmProfiles || [];
                diagLogger.profileState(profileId, 'FOUND', {
                    isActive: currentProfile?.isActive,
                    totalProfiles: allProfiles.length,
                    activeProfiles: allProfiles.filter(p => p.isActive).length,
                    profileDetails: {
                        id: currentProfile?.id,
                        title: currentProfile?.title,
                        isActive: currentProfile?.isActive
                    }
                });

                const now = new Date();

                // Atomic operation: deactivate all profiles, activate the specified one, update FCM schedule
                // First, set all profiles to inactive
                diagLogger.step('Deactivating all profiles');
                const deactivateResult = await MindTrainUser.updateOne(
                    { userId: userIdObjectId },
                    {
                        $set: {
                            'alarmProfiles.$[].isActive': false
                        }
                    },
                    { session }
                ).exec();

                diagLogger.mongoOperation('updateOne (deactivate all)', deactivateResult, {
                    operation: 'deactivate_all_profiles',
                    userId: userIdObjectId.toString()
                });

                if (deactivateResult.matchedCount === 0) {
                    diagLogger.warn('No documents matched for deactivation', {
                        matchedCount: deactivateResult.matchedCount,
                        modifiedCount: deactivateResult.modifiedCount
                    });
                } else {
                    diagLogger.step('All profiles deactivated', {
                        matchedCount: deactivateResult.matchedCount,
                        modifiedCount: deactivateResult.modifiedCount
                    });
                }

                // Then, activate the target profile and update FCM schedule
                diagLogger.step('Activating target profile and updating FCM schedule');
                const activateResult = await MindTrainUser.findOneAndUpdate(
                    { userId: userIdObjectId },
                    {
                        $set: {
                            'alarmProfiles.$[elem].isActive': true,
                            'alarmProfiles.$[elem].updatedAt': now,
                            'fcmSchedule.activeProfileId': profileId,
                            'fcmSchedule.isEnabled': true,
                            'fcmSchedule.updatedAt': now,
                            'metadata.lastProfileUpdateAt': now,
                            updatedAt: now
                        }
                    },
                    {
                        arrayFilters: [{ 'elem.id': profileId }],
                        new: true,
                        session
                    }
                ).exec();

                // CRITICAL FIX: Check if update actually happened
                diagLogger.mongoOperation('findOneAndUpdate (activate profile)', activateResult, {
                    operation: 'activate_target_profile',
                    profileId,
                    arrayFilter: { 'elem.id': profileId }
                });

                if (!activateResult) {
                    diagLogger.error('CRITICAL: findOneAndUpdate returned null - no document was updated', null, {
                        userId: userIdObjectId.toString(),
                        profileId,
                        reason: 'Array filter did not match any profile or user not found'
                    });
                    await session.abortTransaction();
                    session.endSession();
                    diagLogger.transactionState('ABORTED', { reason: 'findOneAndUpdate returned null' });
                    throw new DatabaseError(`Failed to activate profile ${profileId}: Update operation returned null`);
                }

                // Verify the profile was actually activated
                const activatedProfile = activateResult.alarmProfiles?.find(p => p.id === profileId);
                if (!activatedProfile || !activatedProfile.isActive) {
                    diagLogger.error('CRITICAL: Profile activation failed - profile not found or not active in result', null, {
                        profileFound: !!activatedProfile,
                        isActive: activatedProfile?.isActive,
                        resultProfileIds: activateResult.alarmProfiles?.map(p => ({ id: p.id, isActive: p.isActive }))
                    });
                    await session.abortTransaction();
                    session.endSession();
                    diagLogger.transactionState('ABORTED', { reason: 'Profile not activated in result' });
                    throw new DatabaseError(`Failed to activate profile ${profileId}: Profile not active after update`);
                }

                diagLogger.profileState(profileId, 'ACTIVATED', {
                    isActive: activatedProfile.isActive,
                    updatedAt: activatedProfile.updatedAt,
                    fcmScheduleActiveProfileId: activateResult.fcmSchedule?.activeProfileId
                });

                await session.commitTransaction();
                session.endSession();
                diagLogger.transactionState('COMMITTED', { success: true });

                operationLogger.info('Profile activated successfully', { profileId });

                // Fetch updated user to verify final state
                diagLogger.step('Fetching updated user to verify final state');
                const updatedUser = await MindTrainUser.findOne({ userId: userIdObjectId })
                    .lean()
                    .exec();

                const finalProfile = updatedUser?.alarmProfiles?.find(p => p.id === profileId);
                diagLogger.profileState(profileId, 'FINAL_VERIFICATION', {
                    found: !!finalProfile,
                    isActive: finalProfile?.isActive,
                    totalProfiles: updatedUser?.alarmProfiles?.length || 0,
                    activeProfiles: updatedUser?.alarmProfiles?.filter(p => p.isActive).length || 0,
                    fcmScheduleActiveProfileId: updatedUser?.fcmSchedule?.activeProfileId
                });

                if (!finalProfile || !finalProfile.isActive) {
                    diagLogger.error('CRITICAL: Final verification failed - profile not active after commit', null, {
                        profileFound: !!finalProfile,
                        isActive: finalProfile?.isActive
                    });
                    // Don't throw here - transaction already committed, but log the issue
                } else {
                    diagLogger.step('Final verification passed', {
                        profileId: finalProfile.id,
                        isActive: finalProfile.isActive
                    });
                }

                metrics.increment('mindtrain_profile_activated', 1);
                diagLogger.complete('Profile activation completed successfully', {
                    profileId,
                    isActive: finalProfile?.isActive,
                    totalProfiles: updatedUser?.alarmProfiles?.length
                });
                
                // Log full diagnostic summary
                diagLogger.logSummary();
                
                return updatedUser;
            } catch (error) {
                diagLogger.error('Error during transaction', error, {
                    errorName: error?.name,
                    errorMessage: error?.message
                });
                await session.abortTransaction();
                session.endSession();
                diagLogger.transactionState('ABORTED', { reason: error?.message });
                throw error;
            }
        } catch (error) {
            if (error instanceof ValidationError || error instanceof ProfileNotFoundError || error instanceof DatabaseError) {
                diagLogger.error('Known error type', error);
                throw error;
            }
            operationLogger.error('Error activating profile', error, { userId, profileId });
            diagLogger.error('Unknown error type', error);
            diagLogger.logSummary();
            throw new DatabaseError('Failed to activate profile', error);
        }
    }, { operation: 'activate_profile' });
};

/**
 * Delete an alarm profile
 * Removes profile from alarmProfiles array
 * If deleted profile was active, clears fcmSchedule.activeProfileId
 * Auto-updates metadata
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {string} profileId - Profile ID to delete
 * @returns {Promise<Object>} Updated MindTrainUser document
 */
const deleteAlarmProfile = async (userId, profileId) => {
    const operationLogger = logger.child({ 
        operation: 'deleteAlarmProfile', 
        userId, 
        profileId 
    });
    
    return await metrics.record('mindtrain_profile_delete', async () => {
        try {
            if (!userId || !profileId) {
                throw new ValidationError('userId and profileId are required');
            }

            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;

            // First, check if profile exists and if it's active
            const user = await MindTrainUser.findOne({
                userId: userIdObjectId,
                'alarmProfiles.id': profileId
            }).exec();

            if (!user) {
                throw new ProfileNotFoundError(profileId);
            }

            const profile = user.alarmProfiles.find(p => p.id === profileId);
            const wasActive = profile && profile.isActive;

            operationLogger.debug('Deleting alarm profile', { wasActive });

            const now = new Date();

            // Calculate metadata after deletion (before we delete)
            const remainingProfiles = user.alarmProfiles.filter(p => p.id !== profileId);
            const remainingActiveProfiles = remainingProfiles.filter(p => p.isActive);

            // Remove the profile and update metadata in one atomic operation
            const updateQuery = {
                $pull: { alarmProfiles: { id: profileId } },
                $set: {
                    'metadata.lastProfileUpdateAt': now,
                    'metadata.totalAlarmProfiles': remainingProfiles.length,
                    'metadata.activeAlarmProfiles': remainingActiveProfiles.length,
                    updatedAt: now
                }
            };

            // If deleted profile was active, clear activeProfileId
            if (wasActive) {
                updateQuery.$set['fcmSchedule.activeProfileId'] = null;
                updateQuery.$set['fcmSchedule.updatedAt'] = now;
            }

            const updatedUser = await MindTrainUser.findOneAndUpdate(
                { userId: userIdObjectId },
                updateQuery,
                { new: true }
            ).exec();

            if (!updatedUser) {
                throw new UserNotFoundError(userId);
            }

            // Try to save for any additional middleware, but don't fail if it errors
            // (deletion already succeeded, metadata already updated)
            try {
                await updatedUser.save();
            } catch (saveError) {
                operationLogger.warn('Save after deletion failed (non-critical)', { 
                    error: saveError.message, 
                    userId, 
                    profileId 
                });
                // Continue - deletion and metadata update already succeeded
            }

            operationLogger.info('Alarm profile deleted successfully', { profileId, wasActive });
            metrics.increment('mindtrain_profile_deleted', 1);

            return updatedUser.toObject();
        } catch (error) {
            if (error instanceof ValidationError || error instanceof ProfileNotFoundError || error instanceof UserNotFoundError) {
                throw error;
            }
            operationLogger.error('Error deleting alarm profile', error, { userId, profileId });
            throw new DatabaseError('Failed to delete alarm profile', error);
        }
    }, { operation: 'delete_profile' });
};

/**
 * Update FCM schedule
 * Updates FCM schedule fields
 * Supports partial updates
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {Object} fcmUpdates - Partial FCM schedule updates
 * @returns {Promise<Object>} Updated MindTrainUser document
 */
const updateFCMSchedule = async (userId, fcmUpdates) => {
    const operationLogger = logger.child({ 
        operation: 'updateFCMSchedule', 
        userId 
    });
    
    return await metrics.record('mindtrain_fcm_update', async () => {
        try {
            if (!userId) {
                throw new ValidationError('userId is required');
            }
            if (!fcmUpdates || Object.keys(fcmUpdates).length === 0) {
                throw new ValidationError('fcmUpdates object is required');
            }

            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;

            const updateFields = {};
            const now = new Date();

            // Build update object for FCM schedule
            Object.keys(fcmUpdates).forEach(key => {
                if (key !== 'createdAt') {
                    updateFields[`fcmSchedule.${key}`] = fcmUpdates[key];
                }
            });

            // Always update updatedAt
            updateFields['fcmSchedule.updatedAt'] = now;
            updateFields['updatedAt'] = now;

            operationLogger.debug('Updating FCM schedule');

            // Check if user exists before updating FCM schedule
            const userExists = await MindTrainUser.findOne({ userId: userIdObjectId }).lean();
            if (!userExists) {
                operationLogger.warn('User not found, creating user with FCM schedule');
                // Create user with FCM schedule if it doesn't exist
                const newUser = new MindTrainUser({
                    userId: userIdObjectId,
                    alarmProfiles: [],
                    fcmSchedule: {
                        ...fcmUpdates,
                        updatedAt: now,
                        createdAt: now
                    },
                    notificationLogs: [],
                    syncHealthLogs: [],
                    metadata: {
                        totalAlarmProfiles: 0,
                        activeAlarmProfiles: 0,
                        totalNotifications: 0,
                        totalSyncHealthLogs: 0
                    }
                });
                await newUser.save();
                operationLogger.info('User created with FCM schedule');
                return newUser.toObject();
            }

            const user = await MindTrainUser.findOneAndUpdate(
                { userId: userIdObjectId },
                { $set: updateFields },
                { new: true, upsert: false }
            ).exec();

            if (!user) {
                throw new UserNotFoundError(userId);
            }

            await user.save();

            operationLogger.info('FCM schedule updated successfully');
            metrics.increment('mindtrain_fcm_updated', 1);

            return user.toObject();
        } catch (error) {
            if (error instanceof ValidationError || error instanceof UserNotFoundError) {
                throw error;
            }
            operationLogger.error('Error updating FCM schedule', error, { userId });
            throw new DatabaseError('Failed to update FCM schedule', error);
        }
    }, { operation: 'update_fcm' });
};

/**
 * Add notification log
 * Adds to notificationLogs array (auto-rotates to max 100)
 * Auto-updates metadata
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {Object} notificationData - Notification log data
 * @returns {Promise<Object>} Updated MindTrainUser document
 */
const addNotificationLog = async (userId, notificationData) => {
    const operationLogger = logger.child({ 
        operation: 'addNotificationLog', 
        userId,
        notificationId: notificationData?.notificationId
    });
    
    return await metrics.record('mindtrain_notification_add', async () => {
        try {
            if (!userId) {
                throw new ValidationError('userId is required');
            }
            if (!notificationData || !notificationData.notificationId) {
                throw new ValidationError('notificationData with notificationId is required');
            }

            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;

            const now = new Date();
            const newNotification = {
                ...notificationData,
                createdAt: now,
                updatedAt: now
            };

            operationLogger.debug('Adding notification log');

            const user = await MindTrainUser.findOneAndUpdate(
                { userId: userIdObjectId },
                {
                    $push: { notificationLogs: newNotification },
                    $set: { updatedAt: now }
                },
                { new: true, upsert: false }
            ).exec();

            if (!user) {
                throw new UserNotFoundError(userId);
            }

            // Metadata and rotation will be handled by pre-save middleware
            await user.save();

            operationLogger.debug('Notification log added successfully');
            metrics.increment('mindtrain_notification_added', 1, { 
                status: notificationData.status || 'pending' 
            });

            return user.toObject();
        } catch (error) {
            if (error instanceof ValidationError || error instanceof UserNotFoundError) {
                throw error;
            }
            operationLogger.error('Error adding notification log', error, { userId });
            throw new DatabaseError('Failed to add notification log', error);
        }
    }, { operation: 'add_notification' });
};

/**
 * Add sync health log
 * Adds to syncHealthLogs array (auto-rotates to max 50)
 * Auto-updates metadata
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {Object} healthLogData - Sync health log data
 * @returns {Promise<Object>} Updated MindTrainUser document
 */
const addSyncHealthLog = async (userId, healthLogData) => {
    const operationLogger = logger.child({ 
        operation: 'addSyncHealthLog', 
        userId,
        deviceId: healthLogData?.deviceId
    });
    
    return await metrics.record('mindtrain_health_add', async () => {
        try {
            if (!userId) {
                throw new ValidationError('userId is required');
            }
            if (!healthLogData || !healthLogData.deviceId) {
                throw new ValidationError('healthLogData with deviceId is required');
            }

            const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;

            const now = new Date();
            const newHealthLog = {
                ...healthLogData,
                reportedAt: healthLogData.reportedAt || now,
                createdAt: now,
                updatedAt: now
            };

            operationLogger.debug('Adding sync health log');

            const user = await MindTrainUser.findOneAndUpdate(
                { userId: userIdObjectId },
                {
                    $push: { syncHealthLogs: newHealthLog },
                    $set: { updatedAt: now }
                },
                { new: true, upsert: false }
            ).exec();

            if (!user) {
                throw new UserNotFoundError(userId);
            }

            // Metadata and rotation will be handled by pre-save middleware
            await user.save();

            operationLogger.debug('Sync health log added successfully', {
                healthScore: healthLogData.healthScore
            });
            metrics.increment('mindtrain_health_added', 1, {
                healthScore: healthLogData.healthScore || 100
            });

            return user.toObject();
        } catch (error) {
            if (error instanceof ValidationError || error instanceof UserNotFoundError) {
                throw error;
            }
            operationLogger.error('Error adding sync health log', error, { userId });
            throw new DatabaseError('Failed to add sync health log', error);
        }
    }, { operation: 'add_health' });
};

/**
 * Get failed notifications (helper method)
 * Filters from complete user data
 * 
 * @param {string|ObjectId} userId - User ID
 * @param {number} hours - Number of hours to look back (default: 24)
 * @returns {Promise<Array>} Array of failed notifications
 */
const getFailedNotifications = async (userId, hours = 24) => {
    const operationLogger = logger.child({ 
        operation: 'getFailedNotifications', 
        userId,
        hours
    });
    
    return await metrics.record('mindtrain_notifications_failed_get', async () => {
        try {
            if (!userId) {
                throw new ValidationError('userId is required');
            }

            const user = await getMindTrainUser(userId);
            if (!user || !user.notificationLogs) {
                operationLogger.debug('No user or notification logs found');
                return [];
            }

            const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
            
            const failed = user.notificationLogs.filter(log => 
                log.status === 'failed' && 
                log.createdAt >= cutoffTime
            );

            operationLogger.debug('Retrieved failed notifications', { count: failed.length });
            return failed;
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            operationLogger.error('Error getting failed notifications', error, { userId });
            throw new DatabaseError('Failed to get failed notifications', error);
        }
    }, { operation: 'get_failed_notifications' });
};

/**
 * Find users needing sync (admin/background job method)
 * Finds users with profiles that need sync based on nextSyncCheckTime
 * 
 * @param {number} limit - Maximum number of users to return (default: 100)
 * @returns {Promise<Array>} Array of user documents needing sync
 */
const findUsersNeedingSync = async (limit = 100) => {
    const operationLogger = logger.child({ 
        operation: 'findUsersNeedingSync', 
        limit
    });
    
    return await metrics.record('mindtrain_users_sync_find', async () => {
        try {
            const now = new Date();
            
            operationLogger.debug('Finding users needing sync');

            const users = await MindTrainUser.find({
                'alarmProfiles.nextSyncCheckTime': { $lte: now },
                'alarmProfiles.isActive': true
            })
            .limit(limit)
            .lean()
            .exec();

            operationLogger.info('Found users needing sync', { count: users.length });
            metrics.gauge('mindtrain_users_needing_sync', users.length);

            return users;
        } catch (error) {
            operationLogger.error('Error finding users needing sync', error);
            throw new DatabaseError('Failed to find users needing sync', error);
        }
    }, { operation: 'find_users_sync' });
};

/**
 * Update notification log status
 * Updates notification log in nested array by notificationId
 * 
 * @param {string} notificationId - Notification ID
 * @param {Object} updates - Status updates (status, deliveredAt, failedAt, deliveryError, etc.)
 * @returns {Promise<Object|null>} Updated user document or null if not found
 */
const updateNotificationLog = async (notificationId, updates) => {
    const operationLogger = logger.child({ 
        operation: 'updateNotificationLog', 
        notificationId
    });
    
    return await metrics.record('mindtrain_notification_update', async () => {
        try {
            if (!notificationId) {
                throw new ValidationError('notificationId is required');
            }

            const updateFields = {};
            const now = new Date();

            // Build update object for array element
            Object.keys(updates).forEach(key => {
                if (key !== 'notificationId' && key !== 'createdAt') {
                    updateFields[`notificationLogs.$.${key}`] = updates[key];
                }
            });

            // Always update updatedAt
            updateFields['notificationLogs.$.updatedAt'] = now;
            updateFields['updatedAt'] = now;

            operationLogger.debug('Updating notification log');

            const user = await MindTrainUser.findOneAndUpdate(
                {
                    'notificationLogs.notificationId': notificationId
                },
                { $set: updateFields },
                { new: true }
            ).exec();

            if (!user) {
                operationLogger.debug('Notification log not found');
                return null;
            }

            await user.save();

            operationLogger.info('Notification log updated successfully', { notificationId });
            metrics.increment('mindtrain_notification_updated', 1);

            return user.toObject();
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            operationLogger.error('Error updating notification log', error, { notificationId });
            throw new DatabaseError('Failed to update notification log', error);
        }
    }, { operation: 'update_notification' });
};

/**
 * Get users with FCM schedules that need notifications
 * Finds users with enabled FCM schedules and active profiles that match exact notification time
 * Includes timezone conversion and deduplication
 * 
 * @param {string} notificationType - 'morning' or 'evening'
 * @param {Date} currentTime - Current time for comparison (default: now)
 * @param {number} windowMinutes - DEPRECATED: No longer used, kept for backward compatibility
 * @returns {Promise<Array>} Array of user documents with matching FCM schedules
 */
const getUsersForNotification = async (notificationType, currentTime = new Date(), windowMinutes = 15) => {
    const operationLogger = logger.child({ 
        operation: 'getUsersForNotification', 
        notificationType,
        currentTime: currentTime.toISOString()
    });
    
    return await metrics.record('mindtrain_users_notification_find', async () => {
        try {
            if (!['morning', 'evening'].includes(notificationType)) {
                throw new ValidationError('notificationType must be "morning" or "evening"');
            }

            const { convertLocalTimeToUTC, isSameDay } = require('../../utils/timezoneUtils');
            const now = new Date(currentTime);
            const currentHour = now.getUTCHours();
            const currentMinute = now.getUTCMinutes();

            operationLogger.debug('Finding users for notification', { 
                notificationType, 
                currentHour,
                currentMinute,
                currentTime: now.toISOString()
            });

            // Query users with enabled schedules and active profiles
            const users = await MindTrainUser.find({
                'fcmSchedule.isEnabled': true,
                'alarmProfiles.isActive': true,
                'fcmSchedule.activeProfileId': { $exists: true, $ne: null }
            })
            .lean()
            .exec();

            operationLogger.debug(`Found ${users.length} users with enabled schedules`);

            // Filter users whose exact time matches (with timezone conversion and deduplication)
            const matchingUsers = users.filter(user => {
                const schedule = user.fcmSchedule;
                if (!schedule || !schedule.isEnabled) {
                    return false;
                }
                
                // Get scheduled time string
                const scheduledTimeStr = notificationType === 'morning'
                    ? schedule.morningNotificationTime
                    : schedule.eveningNotificationTime;
                
                if (!scheduledTimeStr) {
                    return false;
                }
                
                // Parse scheduled time (HH:mm format)
                const [scheduledHour, scheduledMinute] = scheduledTimeStr.split(':').map(Number);
                
                if (isNaN(scheduledHour) || isNaN(scheduledMinute)) {
                    operationLogger.warn('Invalid scheduled time format', { 
                        userId: user.userId, 
                        scheduledTimeStr 
                    });
                    return false;
                }
                
                // Convert to UTC based on user's timezone
                const userTimezone = schedule.timezone || 'UTC';
                const scheduledTimeUTC = convertLocalTimeToUTC(
                    scheduledHour, 
                    scheduledMinute, 
                    userTimezone,
                    now
                );
                
                // Check if exact time matches (hour and minute must match exactly)
                if (scheduledTimeUTC.hour !== currentHour || 
                    scheduledTimeUTC.minute !== currentMinute) {
                    return false;
                }
                
                // Deduplication: Check if already sent today
                const lastSentField = notificationType === 'morning' 
                    ? 'lastMorningSentAt' 
                    : 'lastEveningSentAt';
                
                const lastSent = schedule[lastSentField] || schedule.lastSentAt;
                if (lastSent && isSameDay(lastSent, now)) {
                    operationLogger.debug('Notification already sent today, skipping', {
                        userId: user.userId,
                        notificationType,
                        lastSent: lastSent.toISOString()
                    });
                    return false; // Already sent today
                }
                
                return true;
            });

            operationLogger.info('Found users for notification', { 
                count: matchingUsers.length,
                notificationType,
                totalUsers: users.length
            });
            metrics.gauge('mindtrain_users_for_notification', matchingUsers.length);

            return matchingUsers;
        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            operationLogger.error('Error finding users for notification', error);
            throw new DatabaseError('Failed to find users for notification', error);
        }
    }, { operation: 'get_users_notification' });
};

module.exports = {
    getMindTrainUser,
    createMindTrainUser,
    addAlarmProfile,
    updateAlarmProfile,
    activateProfile,
    deleteAlarmProfile,
    updateFCMSchedule,
    addNotificationLog,
    updateNotificationLog,
    addSyncHealthLog,
    getFailedNotifications,
    findUsersNeedingSync,
    getUsersForNotification
};

