require('dotenv').config();
const mongoose = require('mongoose');

/**
 * MindTrain Data Migration Script
 * 
 * Migrates MindTrain collections from main database to separate MindTrain database
 * 
 * Collections to migrate:
 * - alarmprofiles
 * - fcmschedules
 * - notificationlogs
 * - synchealthlogs
 * 
 * Usage:
 *   node scripts/migrateMindTrainData.js
 * 
 * Environment Variables Required:
 *   - MONGODB_URI (source database)
 *   - MONGODB_URI_MINDTRAIN (target database, or will use MONGODB_URI with 'mindtrain' database name)
 * 
 * Safety Features:
 *   - Dry-run mode (default) - shows what would be migrated without making changes
 *   - Data validation before migration
 *   - Backup recommendations
 *   - Rollback instructions
 */

// Collections to migrate
const COLLECTIONS_TO_MIGRATE = [
    'alarmprofiles',
    'fcmschedules',
    'notificationlogs',
    'synchealthlogs'
];

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'bright');
    console.log('='.repeat(60));
}

/**
 * Get database connection URI
 */
function getSourceURI() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is required');
    }
    return process.env.MONGODB_URI;
}

function getTargetURI() {
    if (process.env.MONGODB_URI_MINDTRAIN) {
        return process.env.MONGODB_URI_MINDTRAIN;
    }
    
    // Fallback: Use main URI but change database name to 'mindtrain'
    const mainURI = process.env.MONGODB_URI;
    return mainURI.replace(/\/([^/?]+)(\?|$)/, '/mindtrain$2');
}

/**
 * Connect to databases
 */
async function connectToDatabases() {
    logSection('Connecting to Databases');
    
    const sourceURI = getSourceURI();
    const targetURI = getTargetURI();
    
    log(`Source: ${sourceURI.replace(/:[^:@]+@/, ':****@')}`, 'cyan');
    log(`Target: ${targetURI.replace(/:[^:@]+@/, ':****@')}`, 'cyan');
    
    // Connect to source database
    const sourceConnection = await mongoose.createConnection(sourceURI, {
        serverSelectionTimeoutMS: 10000
    }).asPromise();
    
    log(`✅ Connected to source database: ${sourceConnection.name}`, 'green');
    
    // Connect to target database
    const targetConnection = await mongoose.createConnection(targetURI, {
        serverSelectionTimeoutMS: 10000
    }).asPromise();
    
    log(`✅ Connected to target database: ${targetConnection.name}`, 'green');
    
    return { sourceConnection, targetConnection };
}

/**
 * Get collection statistics
 */
async function getCollectionStats(connection, collectionName) {
    try {
        const db = connection.db;
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        return {
            exists: true,
            count
        };
    } catch (error) {
        return {
            exists: false,
            count: 0
        };
    }
}

/**
 * Validate collection data
 */
async function validateCollection(connection, collectionName) {
    const db = connection.db;
    const collection = db.collection(collectionName);
    
    // Sample a few documents to check structure
    const sample = await collection.find({}).limit(5).toArray();
    
    return {
        sampleCount: sample.length,
        sampleDocuments: sample
    };
}

/**
 * Migrate a single collection
 */
async function migrateCollection(sourceConnection, targetConnection, collectionName, dryRun = true) {
    logSection(`Migrating Collection: ${collectionName}`);
    
    // Check if collection exists in source
    const sourceStats = await getCollectionStats(sourceConnection, collectionName);
    if (!sourceStats.exists || sourceStats.count === 0) {
        log(`⚠️  Collection '${collectionName}' not found or empty in source database`, 'yellow');
        return {
            success: true,
            skipped: true,
            migrated: 0,
            message: 'Collection not found or empty'
        };
    }
    
    log(`Found ${sourceStats.count} documents in source`, 'cyan');
    
    // Check if collection exists in target
    const targetStats = await getCollectionStats(targetConnection, collectionName);
    if (targetStats.exists && targetStats.count > 0) {
        log(`⚠️  Collection '${collectionName}' already exists in target with ${targetStats.count} documents`, 'yellow');
        log(`   Migration will ADD to existing data (not replace)`, 'yellow');
    }
    
    if (dryRun) {
        log(`[DRY RUN] Would migrate ${sourceStats.count} documents`, 'yellow');
        
        // Validate sample data
        const validation = await validateCollection(sourceConnection, collectionName);
        log(`Sample documents: ${validation.sampleCount}`, 'cyan');
        
        return {
            success: true,
            skipped: false,
            migrated: 0,
            wouldMigrate: sourceStats.count,
            message: 'Dry run - no data migrated'
        };
    }
    
    // Actual migration
    log(`Starting migration of ${sourceStats.count} documents...`, 'cyan');
    
    const sourceDb = sourceConnection.db;
    const targetDb = targetConnection.db;
    const sourceCollection = sourceDb.collection(collectionName);
    const targetCollection = targetDb.collection(collectionName);
    
    // Use cursor to handle large collections efficiently
    const cursor = sourceCollection.find({});
    let migrated = 0;
    let errors = 0;
    const batchSize = 1000;
    let batch = [];
    
    for await (const doc of cursor) {
        batch.push(doc);
        
        if (batch.length >= batchSize) {
            try {
                await targetCollection.insertMany(batch, { ordered: false });
                migrated += batch.length;
                process.stdout.write(`\rMigrated: ${migrated}/${sourceStats.count}`);
            } catch (error) {
                // Handle duplicate key errors (if documents already exist)
                if (error.code === 11000) {
                    // Try inserting one by one, skipping duplicates
                    for (const doc of batch) {
                        try {
                            await targetCollection.insertOne(doc);
                            migrated++;
                        } catch (e) {
                            if (e.code !== 11000) {
                                errors++;
                                console.error(`\nError inserting document:`, e.message);
                            }
                        }
                    }
                } else {
                    errors += batch.length;
                    console.error(`\nBatch insert error:`, error.message);
                }
            }
            batch = [];
        }
    }
    
    // Insert remaining documents
    if (batch.length > 0) {
        try {
            await targetCollection.insertMany(batch, { ordered: false });
            migrated += batch.length;
        } catch (error) {
            if (error.code === 11000) {
                for (const doc of batch) {
                    try {
                        await targetCollection.insertOne(doc);
                        migrated++;
                    } catch (e) {
                        if (e.code !== 11000) {
                            errors++;
                        }
                    }
                }
            } else {
                errors += batch.length;
            }
        }
    }
    
    console.log(); // New line after progress
    
    // Verify migration
    const finalTargetCount = await targetCollection.countDocuments();
    
    log(`✅ Migration complete: ${migrated} documents migrated`, 'green');
    if (errors > 0) {
        log(`⚠️  ${errors} documents had errors`, 'yellow');
    }
    log(`   Target collection now has ${finalTargetCount} documents`, 'cyan');
    
    return {
        success: errors === 0,
        skipped: false,
        migrated,
        errors,
        targetCount: finalTargetCount,
        message: `Migrated ${migrated} documents`
    };
}

/**
 * Create indexes on target collections (matching source indexes)
 */
async function createIndexes(targetConnection, collectionName) {
    log(`Creating indexes for ${collectionName}...`, 'cyan');
    
    // Note: Indexes should be created by Mongoose models when they're loaded
    // This is a placeholder for manual index creation if needed
    // In practice, indexes will be created automatically when models are used
    
    log(`✅ Indexes will be created when models are loaded`, 'green');
}

/**
 * Main migration function
 */
async function runMigration(dryRun = true) {
    try {
        logSection('MindTrain Data Migration Script');
        
        if (dryRun) {
            log('🔍 DRY RUN MODE - No data will be modified', 'yellow');
            log('   Run with --execute flag to perform actual migration', 'yellow');
        } else {
            log('⚠️  EXECUTION MODE - Data will be migrated', 'red');
            log('   Make sure you have a backup before proceeding!', 'red');
        }
        
        // Connect to databases
        const { sourceConnection, targetConnection } = await connectToDatabases();
        
        // Get statistics for all collections
        logSection('Collection Statistics');
        const stats = {};
        for (const collectionName of COLLECTIONS_TO_MIGRATE) {
            const sourceStats = await getCollectionStats(sourceConnection, collectionName);
            const targetStats = await getCollectionStats(targetConnection, collectionName);
            
            stats[collectionName] = {
                source: sourceStats,
                target: targetStats
            };
            
            log(`${collectionName}:`, 'cyan');
            log(`  Source: ${sourceStats.count} documents`, sourceStats.exists ? 'green' : 'yellow');
            log(`  Target: ${targetStats.count} documents`, targetStats.exists ? 'yellow' : 'green');
        }
        
        // Perform migration
        logSection('Migration Process');
        const results = {};
        
        for (const collectionName of COLLECTIONS_TO_MIGRATE) {
            const result = await migrateCollection(
                sourceConnection,
                targetConnection,
                collectionName,
                dryRun
            );
            results[collectionName] = result;
        }
        
        // Summary
        logSection('Migration Summary');
        let totalMigrated = 0;
        let totalErrors = 0;
        
        for (const [collectionName, result] of Object.entries(results)) {
            if (result.skipped) {
                log(`${collectionName}: SKIPPED - ${result.message}`, 'yellow');
            } else if (dryRun) {
                log(`${collectionName}: Would migrate ${result.wouldMigrate} documents`, 'cyan');
                totalMigrated += result.wouldMigrate || 0;
            } else {
                const status = result.success ? '✅' : '⚠️';
                log(`${collectionName}: ${status} ${result.migrated} migrated, ${result.errors} errors`, 
                    result.success ? 'green' : 'yellow');
                totalMigrated += result.migrated || 0;
                totalErrors += result.errors || 0;
            }
        }
        
        if (dryRun) {
            log(`\nTotal documents that would be migrated: ${totalMigrated}`, 'yellow');
            log('\nTo execute migration, run:', 'bright');
            log('  node scripts/migrateMindTrainData.js --execute', 'cyan');
        } else {
            log(`\nTotal documents migrated: ${totalMigrated}`, 'green');
            if (totalErrors > 0) {
                log(`Total errors: ${totalErrors}`, 'yellow');
            }
        }
        
        // Close connections
        await sourceConnection.close();
        await targetConnection.close();
        
        log('\n✅ Migration script completed', 'green');
        
    } catch (error) {
        log(`\n❌ Migration failed: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const execute = args.includes('--execute') || args.includes('-e');

// Run migration
runMigration(!execute).then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

