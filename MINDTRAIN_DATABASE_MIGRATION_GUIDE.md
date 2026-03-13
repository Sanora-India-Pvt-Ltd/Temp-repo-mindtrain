# MindTrain Database Migration Guide

## Overview

This guide documents the migration of MindTrain collections from the main database to a separate MindTrain database. This separation improves database organization and allows for independent scaling.

## What Was Changed

### Phase 1: Database Connection Setup ✅

1. **Created `src/config/dbMindTrain.js`**
   - New module for MindTrain database connection
   - Uses `mongoose.createConnection()` for separate connection
   - Supports `MONGODB_URI_MINDTRAIN` environment variable
   - Falls back to `MONGODB_URI` with database name changed to 'mindtrain'

2. **Updated `src/server.js`**
   - Initializes both main and MindTrain database connections
   - MindTrain connection failure won't crash server (logs warning)

### Phase 2: Model Updates ✅

Updated all 4 MindTrain models to use the new connection:
- `src/models/MindTrain/AlarmProfile.js`
- `src/models/MindTrain/FCMSchedule.js`
- `src/models/MindTrain/NotificationLog.js`
- `src/models/MindTrain/SyncHealthLog.js`

**Changes:**
- Models now use `getMindTrainConnection()` instead of default mongoose connection
- Models are created on the MindTrain connection when first accessed
- All existing imports continue to work (backward compatible)

### Phase 3: Service Updates ✅

1. **Updated `src/services/MindTrain/alarmProfileService.js`**
   - Transactions now use MindTrain connection instead of default connection
   - Ensures transactions work correctly with the new database

### Phase 4: Migration Script ✅

Created `scripts/migrateMindTrainData.js`:
- Exports data from main database
- Imports data into MindTrain database
- Includes dry-run mode for safety
- Validates data before migration
- Provides detailed progress and statistics

## Collections Being Migrated

The following collections will be moved to the MindTrain database:

1. **alarmprofiles** - Alarm profile configurations
2. **fcmschedules** - FCM notification schedules
3. **notificationlogs** - FCM notification delivery logs
4. **synchealthlogs** - Sync health metrics

## Pre-Migration Checklist

Before running the migration:

- [ ] **Backup your database** - Create a full backup of your MongoDB database
- [ ] **Test in development** - Run migration on a development/staging environment first
- [ ] **Check environment variables** - Ensure `.env` file has required variables
- [ ] **Verify connectivity** - Test that both databases are accessible
- [ ] **Schedule downtime** - Plan for a maintenance window (if needed)

## Environment Variables

Add to your `.env` file:

```bash
# Main database (existing)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sanora

# MindTrain database (new - optional)
# If not set, will use MONGODB_URI with database name 'mindtrain'
MONGODB_URI_MINDTRAIN=mongodb+srv://username:password@cluster.mongodb.net/mindtrain
```

**Note:** If `MONGODB_URI_MINDTRAIN` is not set, the script will automatically use `MONGODB_URI` but change the database name to `mindtrain`.

## Migration Steps

### Step 1: Dry Run (Recommended)

First, run the migration script in dry-run mode to see what would be migrated:

```bash
node scripts/migrateMindTrainData.js
```

This will:
- Show statistics for all collections
- Display what would be migrated
- **NOT make any changes** to the database

### Step 2: Review Dry Run Results

Check the output to ensure:
- All expected collections are found
- Document counts match expectations
- No errors or warnings

### Step 3: Execute Migration

Once you're satisfied with the dry-run results, execute the actual migration:

```bash
node scripts/migrateMindTrainData.js --execute
```

Or:

```bash
node scripts/migrateMindTrainData.js -e
```

This will:
- Copy all data from source to target database
- Show progress for each collection
- Verify data integrity after migration

### Step 4: Verify Migration

After migration completes:

1. **Check document counts:**
   ```bash
   # Connect to MongoDB and verify counts
   # Source database should still have data
   # Target database should have same counts
   ```

2. **Test application:**
   - Start your server
   - Test MindTrain API endpoints
   - Verify data is being read from new database
   - Test creating/updating alarm profiles

3. **Monitor logs:**
   - Check for any connection errors
   - Verify MindTrain features work correctly

### Step 5: Cleanup (Optional)

After verifying everything works correctly, you may optionally:

1. **Remove old collections from main database:**
   ```javascript
   // Connect to main database and drop collections
   // Only do this after confirming everything works!
   db.alarmprofiles.drop()
   db.fcmschedules.drop()
   db.notificationlogs.drop()
   db.synchealthlogs.drop()
   ```

2. **Update documentation** - Document the new database structure

## Rollback Plan

If something goes wrong:

1. **Stop the application** - Prevent new data from being written
2. **Restore from backup** - Restore the main database from backup
3. **Revert code changes** - If needed, revert to previous code version
4. **Remove MindTrain database** - Clean up the new database if created

## Post-Migration Verification

After migration, verify:

- [ ] Server starts without errors
- [ ] MindTrain API endpoints respond correctly
- [ ] Can create new alarm profiles
- [ ] Can update existing alarm profiles
- [ ] FCM notifications work
- [ ] Sync health logging works
- [ ] No errors in server logs

## Troubleshooting

### Connection Errors

**Error: "MindTrain database connection not initialized"**

- Ensure `connectMindTrainDB()` is called in `server.js`
- Check that `MONGODB_URI` or `MONGODB_URI_MINDTRAIN` is set
- Verify database credentials are correct

### Migration Errors

**Error: "Collection already exists"**

- The script handles existing collections by adding to them
- If you want to replace, manually drop the collection first:
  ```javascript
  db.collectionName.drop()
  ```

**Error: "Duplicate key error"**

- Some documents may already exist in target database
- The script skips duplicates automatically
- Check the error count in migration summary

### Model Errors

**Error: "Model not found"**

- Ensure models are loaded after database connection
- Check that routes are loaded after `connectMindTrainDB()` call

## Architecture Notes

### Database Separation

- **Main Database:** User, Course, Conference, Social, etc.
- **MindTrain Database:** AlarmProfile, FCMSchedule, NotificationLog, SyncHealthLog

### Cross-Database References

- MindTrain models reference `User` via `userId` (ObjectId)
- These references are stored as ObjectIds (not populated across databases)
- If User data is needed, fetch separately from main database

### Connection Management

- Main database: Uses default `mongoose.connect()`
- MindTrain database: Uses separate `mongoose.createConnection()`
- Both connections are initialized in `server.js`

## Support

If you encounter issues:

1. Check server logs for detailed error messages
2. Verify environment variables are set correctly
3. Test database connectivity separately
4. Review migration script output for specific errors

## Summary

✅ **Code Changes Complete** - All models and services updated
⏳ **Data Migration Pending** - Run migration script when ready
📋 **Testing Required** - Verify all functionality after migration

The code is ready for the separate database. Run the migration script when you're ready to move the data.

