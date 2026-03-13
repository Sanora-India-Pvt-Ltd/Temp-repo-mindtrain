/**
 * Migration Script: Old Collections → Unified MindTrainUser
 * 
 * Migrates data from separate collections (AlarmProfile, FCMSchedule, NotificationLog, SyncHealthLog)
 * to the unified MindTrainUser nested schema.
 * 
 * Usage:
 *   node src/database/migrate-to-nested-schema.js [--dry-run] [--userId=USER_ID]
 * 
 * Options:
 *   --dry-run: Show what would be migrated without making changes
 *   --userId=USER_ID: Migrate only a specific user (for testing)
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { connectMindTrainDB, getMindTrainConnection } = require('../config/dbMindTrain');
const { transformOldProfileToNew, transformOldFCMToNew, transformOldNotificationToNew, transformOldHealthToNew } = require('../utils/transformers');
const logger = require('../utils/logger').child({ component: 'migration' });

// Models will be required AFTER connection is established
let AlarmProfile, FCMSchedule, NotificationLog, SyncHealthLog, MindTrainUser;

const DRY_RUN = process.argv.includes('--dry-run');
const USER_ID_ARG = process.argv.find(arg => arg.startsWith('--userId='));
const TARGET_USER_ID = USER_ID_ARG ? USER_ID_ARG.split('=')[1] : null;

/**
 * Migrate a single user's data
 */
async function migrateUser(userId) {
    logger.info(`Starting migration for user: ${userId}`);

    try {
        // Check if user already exists in unified model
        const existingUser = await MindTrainUser.findOne({ userId }).lean();
        if (existingUser && existingUser.alarmProfiles && existingUser.alarmProfiles.length > 0) {
            logger.warn(`User ${userId} already has data in unified model. Skipping.`);
            return { skipped: true, reason: 'already_migrated' };
        }

        // Fetch all old data
        const [profiles, schedule, notifications, healthLogs] = await Promise.all([
            AlarmProfile.find({ userId }).lean(),
            FCMSchedule.findOne({ userId }).lean(),
            NotificationLog.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(), // Max 100
            SyncHealthLog.find({ userId }).sort({ reportedAt: -1 }).limit(50).lean() // Max 50
        ]);

        logger.info(`Found: ${profiles.length} profiles, ${schedule ? 1 : 0} schedule, ${notifications.length} notifications, ${healthLogs.length} health logs`);

        if (profiles.length === 0 && !schedule && notifications.length === 0 && healthLogs.length === 0) {
            logger.info(`No data to migrate for user ${userId}`);
            return { skipped: true, reason: 'no_data' };
        }

        // Transform data
        const transformedProfiles = profiles.map(transformOldProfileToNew);
        const transformedSchedule = transformOldFCMToNew(schedule);
        const transformedNotifications = notifications.map(transformOldNotificationToNew);
        const transformedHealthLogs = healthLogs.map(transformOldHealthToNew);

        // Create or update unified document
        if (DRY_RUN) {
            logger.info(`[DRY RUN] Would create/update MindTrainUser for ${userId}`);
            logger.info(`[DRY RUN] Profiles: ${transformedProfiles.length}, Schedule: ${schedule ? 'yes' : 'no'}, Notifications: ${transformedNotifications.length}, Health Logs: ${transformedHealthLogs.length}`);
            return { dryRun: true, wouldMigrate: true };
        }

        const unifiedUser = await MindTrainUser.findOneAndUpdate(
            { userId },
            {
                $set: {
                    alarmProfiles: transformedProfiles,
                    fcmSchedule: transformedSchedule,
                    notificationLogs: transformedNotifications,
                    syncHealthLogs: transformedHealthLogs,
                    updatedAt: new Date()
                }
            },
            { upsert: true, new: true }
        );

        logger.info(`✅ Successfully migrated user ${userId}`);
        return {
            success: true,
            userId: userId.toString(),
            profiles: transformedProfiles.length,
            notifications: transformedNotifications.length,
            healthLogs: transformedHealthLogs.length
        };
    } catch (error) {
        logger.error(`Failed to migrate user ${userId}`, error);
        return { success: false, userId: userId.toString(), error: error.message };
    }
}

/**
 * Main migration function
 */
async function runMigration() {
    try {
        logger.info(`Starting migration${DRY_RUN ? ' (DRY RUN)' : ''}...`);

        // Connect to MindTrain database FIRST
        logger.info('Connecting to MindTrain database...');
        await connectMindTrainDB();
        
        // Get MindTrain connection
        const connection = getMindTrainConnection();
        if (!connection) {
            throw new Error('MindTrain database connection not initialized');
        }
        
        logger.info(`✅ Connected to database: ${connection.name}`);
        
        // NOW require models AFTER connection is established
        logger.info('Loading models...');
        AlarmProfile = require('../models/MindTrain/AlarmProfile');
        FCMSchedule = require('../models/MindTrain/FCMSchedule');
        NotificationLog = require('../models/MindTrain/NotificationLog');
        SyncHealthLog = require('../models/MindTrain/SyncHealthLog');
        MindTrainUser = require('../models/MindTrain/MindTrainUser');
        logger.info('✅ Models loaded');

        if (TARGET_USER_ID) {
            // Migrate single user
            const result = await migrateUser(TARGET_USER_ID);
            console.log('\nMigration Result:', JSON.stringify(result, null, 2));
        } else {
            // Migrate all users
            const allUserIds = await AlarmProfile.distinct('userId');
            logger.info(`Found ${allUserIds.length} users to migrate`);

            const results = {
                total: allUserIds.length,
                successful: 0,
                failed: 0,
                skipped: 0,
                errors: []
            };

            for (const userId of allUserIds) {
                const result = await migrateUser(userId);
                if (result.success) {
                    results.successful++;
                } else if (result.skipped) {
                    results.skipped++;
                } else if (result.dryRun) {
                    // Dry run mode - count as successful
                    results.successful++;
                } else {
                    results.failed++;
                    results.errors.push({ userId: userId.toString(), error: result.error || 'Unknown error' });
                }

                // Progress update every 10 users
                if ((results.successful + results.failed + results.skipped) % 10 === 0) {
                    logger.info(`Progress: ${results.successful + results.failed + results.skipped}/${results.total}`);
                }
            }

            console.log('\n=== Migration Summary ===');
            console.log(`Total users: ${results.total}`);
            console.log(`Successful: ${results.successful}`);
            console.log(`Skipped: ${results.skipped}`);
            console.log(`Failed: ${results.failed}`);
            if (results.errors.length > 0) {
                console.log('\nErrors:');
                results.errors.forEach(err => console.log(`  - ${err.userId}: ${err.error}`));
            }
        }

        logger.info('Migration completed');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed', error);
        process.exit(1);
    }
}

// Run migration if called directly
if (require.main === module) {
    runMigration();
}

module.exports = { migrateUser, runMigration };

