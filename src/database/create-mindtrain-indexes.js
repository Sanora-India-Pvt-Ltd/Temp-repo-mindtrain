require('dotenv').config();
const { connectMindTrainDB, getMindTrainConnection } = require('../config/dbMindTrain');
const mongoose = require('mongoose');

/**
 * Create Production Indexes for MindTrainUser Collection
 * 
 * This script creates all production indexes for the unified MindTrainUser schema.
 * Run this script after deploying the new schema to ensure optimal query performance.
 * 
 * Usage:
 *   node src/database/create-mindtrain-indexes.js
 * 
 * Or as npm script:
 *   npm run db:create-mindtrain-indexes
 */

const createIndexes = async (dryRun = false) => {
    try {
        console.log('🔄 Connecting to MindTrain database...');
        await connectMindTrainDB();
        
        const connection = getMindTrainConnection();
        if (!connection) {
            throw new Error('MindTrain database connection not available');
        }
        
        console.log(`✅ Connected to database: ${connection.name}`);
        
        // Import MindTrainUser model AFTER connection is established
        // This will register the model with the connection
        const MindTrainUser = require('../models/MindTrain/MindTrainUser');
        
        // Verify model is registered
        if (!connection.models.MindTrainUser) {
            throw new Error('MindTrainUser model not registered on connection');
        }
        
        console.log('📊 Creating indexes for MindTrainUser collection...');
        console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (indexes will be created)'}`);
        console.log('');

        const indexes = [
            // Primary index on userId (unique)
            {
                name: 'userId_unique',
                spec: { userId: 1 },
                options: { unique: true }
            },
            
            // Alarm profile indexes
            {
                name: 'alarmProfiles_id',
                spec: { 'alarmProfiles.id': 1 },
                options: {}
            },
            {
                name: 'alarmProfiles_isActive',
                spec: { 'alarmProfiles.isActive': 1 },
                options: {}
            },
            {
                name: 'alarmProfiles_lastSyncTimestamp',
                spec: { 'alarmProfiles.lastSyncTimestamp': 1 },
                options: {}
            },
            {
                name: 'alarmProfiles_nextSyncCheckTime',
                spec: { 'alarmProfiles.nextSyncCheckTime': 1 },
                options: {}
            },
            {
                name: 'userId_alarmProfiles_isActive',
                spec: { userId: 1, 'alarmProfiles.isActive': 1 },
                options: {}
            },
            
            // FCM schedule indexes
            {
                name: 'fcmSchedule_isEnabled',
                spec: { 'fcmSchedule.isEnabled': 1 },
                options: {}
            },
            {
                name: 'fcmSchedule_nextMorningNotification',
                spec: { 'fcmSchedule.nextMorningNotification': 1 },
                options: {}
            },
            {
                name: 'fcmSchedule_nextEveningNotification',
                spec: { 'fcmSchedule.nextEveningNotification': 1 },
                options: {}
            },
            
            // Notification log indexes
            {
                name: 'notificationLogs_notificationId',
                spec: { 'notificationLogs.notificationId': 1 },
                options: {}
            },
            {
                name: 'notificationLogs_status',
                spec: { 'notificationLogs.status': 1 },
                options: {}
            },
            {
                name: 'notificationLogs_scheduledTime',
                spec: { 'notificationLogs.scheduledTime': 1 },
                options: {}
            },
            
            // Sync health log indexes
            {
                name: 'syncHealthLogs_deviceId',
                spec: { 'syncHealthLogs.deviceId': 1 },
                options: {}
            },
            {
                name: 'syncHealthLogs_reportedAt',
                spec: { 'syncHealthLogs.reportedAt': -1 },
                options: {}
            },
            {
                name: 'syncHealthLogs_healthScore',
                spec: { 'syncHealthLogs.healthScore': 1 },
                options: {}
            }
        ];

        const results = [];
        
        for (const index of indexes) {
            try {
                if (dryRun) {
                    console.log(`[DRY RUN] Would create index: ${index.name}`);
                    console.log(`  Spec: ${JSON.stringify(index.spec)}`);
                    console.log(`  Options: ${JSON.stringify(index.options)}`);
                    results.push({ name: index.name, status: 'dry_run', spec: index.spec });
                } else {
                    console.log(`Creating index: ${index.name}...`);
                    await MindTrainUser.collection.createIndex(index.spec, {
                        ...index.options,
                        name: index.name
                    });
                    console.log(`✅ Created index: ${index.name}`);
                    results.push({ name: index.name, status: 'created', spec: index.spec });
                }
            } catch (error) {
                if (error.code === 85) {
                    // Index already exists with different options
                    console.log(`⚠️  Index ${index.name} already exists with different options`);
                    results.push({ name: index.name, status: 'exists_different', error: error.message });
                } else if (error.code === 86) {
                    // Index already exists
                    console.log(`ℹ️  Index ${index.name} already exists`);
                    results.push({ name: index.name, status: 'exists', spec: index.spec });
                } else {
                    console.error(`❌ Error creating index ${index.name}:`, error.message);
                    results.push({ name: index.name, status: 'error', error: error.message });
                }
            }
            console.log('');
        }

        // Summary
        console.log('📋 Index Creation Summary:');
        console.log('='.repeat(50));
        const created = results.filter(r => r.status === 'created').length;
        const exists = results.filter(r => r.status === 'exists').length;
        const errors = results.filter(r => r.status === 'error').length;
        const dryRuns = results.filter(r => r.status === 'dry_run').length;
        
        if (dryRun) {
            console.log(`Total indexes to create: ${dryRuns}`);
        } else {
            console.log(`✅ Created: ${created}`);
            console.log(`ℹ️  Already exists: ${exists}`);
            if (errors > 0) {
                console.log(`❌ Errors: ${errors}`);
            }
        }
        console.log('='.repeat(50));

        // Validate indexes
        if (!dryRun) {
            console.log('');
            console.log('🔍 Validating indexes...');
            const existingIndexes = await MindTrainUser.collection.indexes();
            console.log(`Found ${existingIndexes.length} indexes on MindTrainUser collection:`);
            existingIndexes.forEach(idx => {
                console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        }

        return results;
    } catch (error) {
        console.error('❌ Error creating indexes:', error);
        throw error;
    }
};

// Main execution
const main = async () => {
    try {
        const args = process.argv.slice(2);
        const dryRun = args.includes('--dry-run') || args.includes('-d');
        
        await createIndexes(dryRun);
        
        console.log('');
        console.log('✅ Index creation completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Index creation failed:', error);
        process.exit(1);
    }
};

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { createIndexes };

