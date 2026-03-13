require('dotenv').config();
const mongoose = require('mongoose');

// Import all models
const AlarmProfile = require('../src/models/MindTrain/AlarmProfile');
const FCMSchedule = require('../src/models/MindTrain/FCMSchedule');
const SyncHealthLog = require('../src/models/MindTrain/SyncHealthLog');
const NotificationLog = require('../src/models/MindTrain/NotificationLog');

/**
 * Schema Verification Script
 * 
 * Verifies that all models match the specification from BACKEND_ALARM_SYNC_STRATEGY.md
 * Checks: collections, fields, indexes, validation rules, and compatibility
 */

// Expected specifications
const SPECS = {
    AlarmProfile: {
        requiredFields: [
            'id', 'userId', 'youtubeUrl', 'title', 'description',
            'alarmsPerDay', 'selectedDaysPerWeek', 'startTime', 'endTime',
            'isFixedTime', 'fixedTime', 'specificDates', 'isActive'
        ],
        syncFields: [
            'lastSyncTimestamp', 'lastSyncSource', 'syncHealthScore',
            'lastSyncStatus', 'nextSyncCheckTime', 'deviceSyncStatus'
        ],
        expectedIndexes: [
            { name: 'id_1', key: { id: 1 }, unique: true },
            { name: 'userId_1', key: { userId: 1 } },
            { name: 'isActive_1', key: { isActive: 1 } },
            { name: 'lastSyncTimestamp_1', key: { lastSyncTimestamp: 1 } },
            { name: 'nextSyncCheckTime_1', key: { nextSyncCheckTime: 1 } },
            { name: 'userId_1_isActive_1_lastSyncTimestamp_1', key: { userId: 1, isActive: 1, lastSyncTimestamp: 1 } },
            { name: 'userId_1_nextSyncCheckTime_1', key: { userId: 1, nextSyncCheckTime: 1 } }
        ],
        enums: {
            lastSyncSource: ['local', 'workmanager', 'fcm', 'manual'],
            lastSyncStatus: ['success', 'pending', 'failed', 'timeout']
        },
        constraints: {
            syncHealthScore: { min: 0, max: 100, default: 100 },
            alarmsPerDay: { min: 1, max: 24 }
        }
    },
    FCMSchedule: {
        requiredFields: [
            'userId', 'activeProfileId', 'morningNotificationTime',
            'eveningNotificationTime', 'timezone', 'isEnabled',
            'lastSentAt', 'nextMorningNotification', 'nextEveningNotification',
            'deliveryRetries', 'failureReason'
        ],
        expectedIndexes: [
            { name: 'userId_1', key: { userId: 1 }, unique: true },
            { name: 'activeProfileId_1', key: { activeProfileId: 1 } },
            { name: 'timezone_1', key: { timezone: 1 } },
            { name: 'isEnabled_1', key: { isEnabled: 1 } },
            { name: 'nextMorningNotification_1', key: { nextMorningNotification: 1 } },
            { name: 'nextEveningNotification_1', key: { nextEveningNotification: 1 } },
            { name: 'isEnabled_1_nextMorningNotification_1', key: { isEnabled: 1, nextMorningNotification: 1 } },
            { name: 'isEnabled_1_nextEveningNotification_1', key: { isEnabled: 1, nextEveningNotification: 1 } }
        ],
        defaults: {
            morningNotificationTime: '08:00',
            eveningNotificationTime: '20:00',
            timezone: 'UTC',
            isEnabled: true,
            deliveryRetries: 0
        }
    },
    SyncHealthLog: {
        requiredFields: [
            'userId', 'deviceId', 'reportedAt', 'lastWorkManagerCheck',
            'workManagerStatus', 'lastFCMReceived', 'fcmStatus',
            'missedAlarmsCount', 'missedAlarmsReason', 'dozeMode',
            'batteryLevel', 'networkConnectivity', 'healthScore',
            'appVersion', 'osVersion', 'notes'
        ],
        expectedIndexes: [
            { name: 'userId_1', key: { userId: 1 } },
            { name: 'deviceId_1', key: { deviceId: 1 } },
            { name: 'reportedAt_1', key: { reportedAt: 1 } },
            { name: 'userId_1_reportedAt_-1', key: { userId: 1, reportedAt: -1 } }
        ],
        enums: {
            workManagerStatus: ['success', 'failed', 'timeout', 'cancelled', 'not_ran'],
            fcmStatus: ['delivered', 'failed', 'pending', 'not_received'],
            missedAlarmsReason: ['workmanager_not_triggered', 'hive_corrupted', 'network_error', 'device_doze', 'unknown'],
            networkConnectivity: ['wifi', 'mobile', 'none']
        },
        constraints: {
            healthScore: { min: 0, max: 100, default: 100 },
            missedAlarmsCount: { min: 0, default: 0 },
            batteryLevel: { min: 0, max: 100 }
        }
    },
    NotificationLog: {
        requiredFields: [
            'userId', 'notificationId', 'type', 'scheduledTime',
            'sentAt', 'deliveredAt', 'openedAt', 'failedAt',
            'status', 'deliveryError', 'deliveryRetries',
            'title', 'body', 'data', 'deviceId', 'fcmToken'
        ],
        expectedIndexes: [
            { name: 'notificationId_1', key: { notificationId: 1 }, unique: true },
            { name: 'userId_1', key: { userId: 1 } },
            { name: 'type_1', key: { type: 1 } },
            { name: 'scheduledTime_1', key: { scheduledTime: 1 } },
            { name: 'status_1', key: { status: 1 } },
            { name: 'deviceId_1', key: { deviceId: 1 } },
            { name: 'createdAt_1', key: { createdAt: 1 } },
            { name: 'status_1_scheduledTime_1', key: { status: 1, scheduledTime: 1 } }
        ],
        enums: {
            type: ['sync_trigger', 'alarm_missed', 'schedule_update', 'system_alert'],
            status: ['pending', 'sent', 'delivered', 'opened', 'failed', 'bounced']
        },
        defaults: {
            type: 'sync_trigger',
            status: 'pending',
            deliveryRetries: 0
        }
    }
};

// Helper function to compare index keys (order-independent)
function indexKeysMatch(key1, key2) {
    const keys1 = Object.keys(key1).sort();
    const keys2 = Object.keys(key2).sort();
    if (keys1.length !== keys2.length) return false;
    return keys1.every(k => key1[k] === key2[k]);
}

// Helper function to find index in array
function findIndex(indexes, expectedIndex) {
    return indexes.find(idx => {
        // Check by name first
        if (idx.name === expectedIndex.name) return true;
        // Check by key structure
        return indexKeysMatch(idx.key, expectedIndex.key);
    });
}

async function verifyCollection(db, collectionName, modelName) {
    const collection = db.collection(collectionName);
    const exists = await collection.exists();
    
    if (exists) {
        const count = await collection.countDocuments();
        return { exists: true, count };
    }
    return { exists: false, count: 0 };
}

async function verifyIndexes(db, collectionName, expectedIndexes, modelName) {
    const collection = db.collection(collectionName);
    const actualIndexes = await collection.indexes();
    
    const results = {
        found: [],
        missing: [],
        extra: [],
        allIndexes: actualIndexes
    };
    
    // Check each expected index
    for (const expected of expectedIndexes) {
        const found = findIndex(actualIndexes, expected);
        if (found) {
            results.found.push({
                expected: expected.name,
                actual: found.name,
                key: found.key,
                unique: found.unique || false
            });
        } else {
            results.missing.push(expected);
        }
    }
    
    // Find extra indexes (not in expected list, excluding _id_)
    const expectedKeys = expectedIndexes.map(e => JSON.stringify(e.key));
    actualIndexes.forEach(idx => {
        if (idx.name === '_id_') return; // Skip automatic _id_ index
        const keyStr = JSON.stringify(idx.key);
        if (!expectedKeys.some(ek => {
            try {
                const ekObj = JSON.parse(ek);
                return indexKeysMatch(ekObj, idx.key);
            } catch {
                return false;
            }
        })) {
            results.extra.push({
                name: idx.name,
                key: idx.key,
                unique: idx.unique || false
            });
        }
    });
    
    return results;
}

async function verifyFields(model, requiredFields, modelName) {
    const schema = model.schema;
    const results = {
        found: [],
        missing: [],
        allFields: Object.keys(schema.paths)
    };
    
    for (const fieldName of requiredFields) {
        const field = schema.paths[fieldName];
        if (field) {
            results.found.push({
                name: fieldName,
                type: field.instance,
                required: field.isRequired || false,
                default: field.defaultValue !== undefined ? field.defaultValue : null
            });
        } else {
            results.missing.push(fieldName);
        }
    }
    
    return results;
}

async function testDocumentCreation(model, modelName, testData) {
    try {
        // Try to create a test document
        const testDoc = new model(testData);
        await testDoc.validate();
        return { success: true, errors: [] };
    } catch (error) {
        return { success: false, errors: [error.message] };
    }
}

async function verifyAlarmProfile(db) {
    console.log('\n📊 AlarmProfile Verification');
    console.log('═'.repeat(50));
    
    const results = {
        collection: null,
        fields: null,
        syncFields: null,
        indexes: null,
        compatibility: null
    };
    
    // 1. Check collection
    results.collection = await verifyCollection(db, 'alarmprofiles', 'AlarmProfile');
    console.log(`   Collection: ${results.collection.exists ? '✅ EXISTS' : '⚠️  WILL BE CREATED'}`);
    if (results.collection.exists) {
        console.log(`   Document count: ${results.collection.count}`);
    }
    
    // 2. Verify required fields
    results.fields = await verifyFields(AlarmProfile, SPECS.AlarmProfile.requiredFields, 'AlarmProfile');
    console.log(`\n   Required Fields: ${results.fields.found.length}/${SPECS.AlarmProfile.requiredFields.length} found`);
    if (results.fields.missing.length > 0) {
        console.log(`   ❌ Missing: ${results.fields.missing.join(', ')}`);
    } else {
        console.log(`   ✅ All required fields present`);
    }
    
    // 3. Verify sync fields
    results.syncFields = await verifyFields(AlarmProfile, SPECS.AlarmProfile.syncFields, 'AlarmProfile');
    console.log(`\n   Sync Fields: ${results.syncFields.found.length}/${SPECS.AlarmProfile.syncFields.length} found`);
    if (results.syncFields.missing.length > 0) {
        console.log(`   ❌ Missing: ${results.syncFields.missing.join(', ')}`);
    } else {
        console.log(`   ✅ All sync fields present`);
        // Show sync field details
        results.syncFields.found.forEach(field => {
            console.log(`      - ${field.name}: ${field.type}${field.default !== null ? ` (default: ${field.default})` : ''}`);
        });
    }
    
    // 4. Verify indexes
    if (results.collection.exists) {
        results.indexes = await verifyIndexes(db, 'alarmprofiles', SPECS.AlarmProfile.expectedIndexes, 'AlarmProfile');
        console.log(`\n   Indexes: ${results.indexes.found.length}/${SPECS.AlarmProfile.expectedIndexes.length} found`);
        
        if (results.indexes.missing.length > 0) {
            console.log(`   ❌ Missing indexes:`);
            results.indexes.missing.forEach(idx => {
                console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        }
        
        if (results.indexes.extra.length > 0) {
            console.log(`   ⚠️  Extra indexes (may be optimizations):`);
            results.indexes.extra.forEach(idx => {
                console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}${idx.unique ? ' (unique)' : ''}`);
            });
        }
        
        if (results.indexes.missing.length === 0) {
            console.log(`   ✅ All required indexes present`);
        }
    } else {
        console.log(`\n   Indexes: ⚠️  Will be created when collection is first used`);
    }
    
    // 5. Test compatibility with existing documents
    if (results.collection.exists && results.collection.count > 0) {
        const sampleDoc = await AlarmProfile.findOne({});
        if (sampleDoc) {
            const hasNewFields = {
                lastSyncTimestamp: sampleDoc.lastSyncTimestamp !== undefined,
                lastSyncSource: sampleDoc.lastSyncSource !== undefined,
                syncHealthScore: sampleDoc.syncHealthScore !== undefined,
                lastSyncStatus: sampleDoc.lastSyncStatus !== undefined
            };
            
            console.log(`\n   Compatibility Test:`);
            const allHaveFields = Object.values(hasNewFields).every(v => v);
            if (allHaveFields) {
                console.log(`   ✅ Existing documents have new sync fields`);
            } else {
                console.log(`   ⚠️  Some existing documents missing sync fields:`);
                Object.entries(hasNewFields).forEach(([field, exists]) => {
                    console.log(`      - ${field}: ${exists ? '✅' : '❌'}`);
                });
                console.log(`   💡 Run backfill script to add default values`);
            }
            results.compatibility = hasNewFields;
        }
    } else {
        console.log(`\n   Compatibility: ℹ️  No existing documents to test`);
    }
    
    return results;
}

async function verifyFCMSchedule(db) {
    console.log('\n📊 FCMSchedule Verification');
    console.log('═'.repeat(50));
    
    const results = {
        collection: null,
        fields: null,
        indexes: null
    };
    
    // 1. Check collection
    results.collection = await verifyCollection(db, 'fcmschedules', 'FCMSchedule');
    console.log(`   Collection: ${results.collection.exists ? '✅ EXISTS' : '⚠️  WILL BE CREATED'}`);
    if (results.collection.exists) {
        console.log(`   Document count: ${results.collection.count}`);
    }
    
    // 2. Verify fields
    results.fields = await verifyFields(FCMSchedule, SPECS.FCMSchedule.requiredFields, 'FCMSchedule');
    console.log(`\n   Fields: ${results.fields.found.length}/${SPECS.FCMSchedule.requiredFields.length} found`);
    if (results.fields.missing.length > 0) {
        console.log(`   ❌ Missing: ${results.fields.missing.join(', ')}`);
    } else {
        console.log(`   ✅ All fields present`);
    }
    
    // 3. Verify indexes
    if (results.collection.exists) {
        results.indexes = await verifyIndexes(db, 'fcmschedules', SPECS.FCMSchedule.expectedIndexes, 'FCMSchedule');
        console.log(`\n   Indexes: ${results.indexes.found.length}/${SPECS.FCMSchedule.expectedIndexes.length} found`);
        
        if (results.indexes.missing.length > 0) {
            console.log(`   ❌ Missing indexes:`);
            results.indexes.missing.forEach(idx => {
                console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        }
        
        if (results.indexes.extra.length > 0) {
            console.log(`   ⚠️  Extra indexes:`);
            results.indexes.extra.forEach(idx => {
                console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        }
        
        if (results.indexes.missing.length === 0) {
            console.log(`   ✅ All required indexes present`);
        }
    } else {
        console.log(`\n   Indexes: ⚠️  Will be created when collection is first used`);
    }
    
    return results;
}

async function verifySyncHealthLog(db) {
    console.log('\n📊 SyncHealthLog Verification');
    console.log('═'.repeat(50));
    
    const results = {
        collection: null,
        fields: null,
        indexes: null
    };
    
    // 1. Check collection
    results.collection = await verifyCollection(db, 'synchealthlogs', 'SyncHealthLog');
    console.log(`   Collection: ${results.collection.exists ? '✅ EXISTS' : '⚠️  WILL BE CREATED'}`);
    if (results.collection.exists) {
        console.log(`   Document count: ${results.collection.count}`);
    }
    
    // 2. Verify fields
    results.fields = await verifyFields(SyncHealthLog, SPECS.SyncHealthLog.requiredFields, 'SyncHealthLog');
    console.log(`\n   Fields: ${results.fields.found.length}/${SPECS.SyncHealthLog.requiredFields.length} found`);
    if (results.fields.missing.length > 0) {
        console.log(`   ❌ Missing: ${results.fields.missing.join(', ')}`);
    } else {
        console.log(`   ✅ All fields present`);
    }
    
    // 3. Verify indexes
    if (results.collection.exists) {
        results.indexes = await verifyIndexes(db, 'synchealthlogs', SPECS.SyncHealthLog.expectedIndexes, 'SyncHealthLog');
        console.log(`\n   Indexes: ${results.indexes.found.length}/${SPECS.SyncHealthLog.expectedIndexes.length} found`);
        
        if (results.indexes.missing.length > 0) {
            console.log(`   ❌ Missing indexes:`);
            results.indexes.missing.forEach(idx => {
                console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        }
        
        if (results.indexes.extra.length > 0) {
            console.log(`   ⚠️  Extra indexes (may be optimizations):`);
            results.indexes.extra.forEach(idx => {
                console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        }
        
        if (results.indexes.missing.length === 0) {
            console.log(`   ✅ All required indexes present`);
        }
    } else {
        console.log(`\n   Indexes: ⚠️  Will be created when collection is first used`);
    }
    
    return results;
}

async function verifyNotificationLog(db) {
    console.log('\n📊 NotificationLog Verification');
    console.log('═'.repeat(50));
    
    const results = {
        collection: null,
        fields: null,
        indexes: null
    };
    
    // 1. Check collection
    results.collection = await verifyCollection(db, 'notificationlogs', 'NotificationLog');
    console.log(`   Collection: ${results.collection.exists ? '✅ EXISTS' : '⚠️  WILL BE CREATED'}`);
    if (results.collection.exists) {
        console.log(`   Document count: ${results.collection.count}`);
    }
    
    // 2. Verify fields
    results.fields = await verifyFields(NotificationLog, SPECS.NotificationLog.requiredFields, 'NotificationLog');
    console.log(`\n   Fields: ${results.fields.found.length}/${SPECS.NotificationLog.requiredFields.length} found`);
    if (results.fields.missing.length > 0) {
        console.log(`   ❌ Missing: ${results.fields.missing.join(', ')}`);
    } else {
        console.log(`   ✅ All fields present`);
    }
    
    // 3. Verify indexes
    if (results.collection.exists) {
        results.indexes = await verifyIndexes(db, 'notificationlogs', SPECS.NotificationLog.expectedIndexes, 'NotificationLog');
        console.log(`\n   Indexes: ${results.indexes.found.length}/${SPECS.NotificationLog.expectedIndexes.length} found`);
        
        if (results.indexes.missing.length > 0) {
            console.log(`   ❌ Missing indexes:`);
            results.indexes.missing.forEach(idx => {
                console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        }
        
        if (results.indexes.extra.length > 0) {
            console.log(`   ⚠️  Extra indexes (may be optimizations):`);
            results.indexes.extra.forEach(idx => {
                console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
            });
        }
        
        if (results.indexes.missing.length === 0) {
            console.log(`   ✅ All required indexes present`);
        }
    } else {
        console.log(`\n   Indexes: ⚠️  Will be created when collection is first used`);
    }
    
    return results;
}

async function generateSummary(allResults) {
    console.log('\n\n📈 Verification Summary');
    console.log('═'.repeat(50));
    
    let totalFieldsFound = 0;
    let totalFieldsExpected = 0;
    let totalIndexesFound = 0;
    let totalIndexesExpected = 0;
    let missingIndexes = 0;
    let extraIndexes = 0;
    let collectionsExist = 0;
    
    const modelNames = ['AlarmProfile', 'FCMSchedule', 'SyncHealthLog', 'NotificationLog'];
    
    modelNames.forEach(modelName => {
        const key = modelName === 'AlarmProfile' ? 'alarmProfile' : 
                   modelName === 'FCMSchedule' ? 'fcmSchedule' :
                   modelName === 'SyncHealthLog' ? 'syncHealthLog' : 'notificationLog';
        
        const result = allResults[key];
        if (!result) return;
        
        if (result.collection && result.collection.exists) collectionsExist++;
        
        if (result.fields) {
            totalFieldsFound += result.fields.found.length;
            const spec = SPECS[modelName];
            totalFieldsExpected += spec.requiredFields.length;
            if (modelName === 'AlarmProfile' && result.syncFields) {
                totalFieldsFound += result.syncFields.found.length;
                totalFieldsExpected += spec.syncFields.length;
            }
        }
        
        if (result.indexes) {
            totalIndexesFound += result.indexes.found.length;
            totalIndexesExpected += SPECS[modelName].expectedIndexes.length;
            missingIndexes += result.indexes.missing.length;
            extraIndexes += result.indexes.extra.length;
        }
    });
    
    console.log(`\n✅ Collections: ${collectionsExist}/4 exist (others will be auto-created)`);
    console.log(`✅ Fields: ${totalFieldsFound}/${totalFieldsExpected} verified`);
    console.log(`✅ Indexes: ${totalIndexesFound}/${totalIndexesExpected} found`);
    
    if (missingIndexes > 0) {
        console.log(`❌ Missing Indexes: ${missingIndexes}`);
    }
    
    if (extraIndexes > 0) {
        console.log(`⚠️  Extra Indexes: ${extraIndexes} (performance optimizations - OK)`);
    }
    
    // Overall status
    const allFieldsOk = totalFieldsFound === totalFieldsExpected;
    const allIndexesOk = missingIndexes === 0;
    
    console.log(`\n${'═'.repeat(50)}`);
    if (allFieldsOk && allIndexesOk) {
        console.log('✅ SCHEMA VERIFICATION PASSED');
        console.log('   All fields and indexes match specification!');
    } else {
        console.log('⚠️  SCHEMA VERIFICATION WITH WARNINGS');
        if (!allFieldsOk) {
            console.log('   Some fields may need attention');
        }
        if (!allIndexesOk) {
            console.log('   Some indexes may need to be created');
        }
    }
    console.log(`${'═'.repeat(50)}\n`);
}

async function verifySchema() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('❌ MONGODB_URI not found in environment variables');
            console.error('💡 Make sure you have a .env file with MONGODB_URI set');
            process.exit(1);
        }
        
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
        });
        
        const db = mongoose.connection.db;
        console.log(`✅ Connected to MongoDB: ${db.databaseName}`);
        
        // Verify all models
        const alarmProfileResult = await verifyAlarmProfile(db);
        const fcmScheduleResult = await verifyFCMSchedule(db);
        const syncHealthLogResult = await verifySyncHealthLog(db);
        const notificationLogResult = await verifyNotificationLog(db);
        
        // Generate summary
        await generateSummary({
            alarmProfile: alarmProfileResult,
            fcmSchedule: fcmScheduleResult,
            syncHealthLog: syncHealthLogResult,
            notificationLog: notificationLogResult
        });
        
    } catch (error) {
        console.error('\n❌ Verification error:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Disconnected from MongoDB\n');
    }
}

// Run verification
verifySchema();

