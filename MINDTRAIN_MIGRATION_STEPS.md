# MindTrain Database Migration - Step-by-Step Instructions

## What We've Done So Far ✅

All code changes are complete:
- ✅ Created separate database connection module
- ✅ Updated all 4 MindTrain models to use new connection
- ✅ Updated services to use MindTrain connection
- ✅ Created migration script with safety features

## What You Need to Do Now

Follow these steps **exactly in order**:

---

## Step 1: Add Environment Variable (Optional but Recommended)

Open your `.env` file and add the MindTrain database URI:

```bash
# Add this line to your .env file
MONGODB_URI_MINDTRAIN=mongodb+srv://username:password@cluster.mongodb.net/mindtrain
```

**Replace:**
- `username` → Your MongoDB username
- `password` → Your MongoDB password
- `cluster` → Your MongoDB cluster URL
- `mindtrain` → The name of the new database

**Alternative:** If you don't add this variable, the system will automatically use your `MONGODB_URI` but change the database name to `mindtrain`.

---

## Step 2: Test the Code (Without Migration)

Start your server to verify the code changes work:

```bash
npm start
```

**What to look for:**
- ✅ Server starts successfully
- ✅ You see: "MongoDB Connected to database: sanora" (main DB)
- ✅ You see: "MindTrain MongoDB Connected to database: mindtrain" (new DB)
- ❌ No connection errors

**If you see errors:**
- Check your `.env` file has `MONGODB_URI` set correctly
- Verify MongoDB credentials are correct
- Check network/firewall settings

**Once server starts successfully, STOP it (Ctrl+C)**

---

## Step 3: Backup Your Database (CRITICAL!)

**Before migrating data, create a backup!**

### Option A: Using MongoDB Atlas (if using cloud)
1. Go to MongoDB Atlas dashboard
2. Click on your cluster
3. Click "..." → "Create Snapshot"
4. Wait for backup to complete

### Option B: Using mongodump (local/command line)
```bash
mongodump --uri="your_MONGODB_URI_here" --out=./backup-before-mindtrain-migration
```

**Don't skip this step!** You'll need the backup if something goes wrong.

---

## Step 4: Run Migration in Dry-Run Mode

This will show you what would be migrated **WITHOUT actually changing anything**:

```bash
node scripts/migrateMindTrainData.js
```

**Expected output:**
```
============================================================
MindTrain Data Migration Script
============================================================
🔍 DRY RUN MODE - No data will be modified
   Run with --execute flag to perform actual migration

============================================================
Connecting to Databases
============================================================
Source: mongodb+srv://...
Target: mongodb+srv://...
✅ Connected to source database: sanora
✅ Connected to target database: mindtrain

============================================================
Collection Statistics
============================================================
alarmprofiles:
  Source: X documents
  Target: 0 documents
fcmschedules:
  Source: Y documents
  Target: 0 documents
notificationlogs:
  Source: Z documents
  Target: 0 documents
synchealthlogs:
  Source: W documents
  Target: 0 documents

============================================================
Migration Summary
============================================================
Total documents that would be migrated: XXX

To execute migration, run:
  node scripts/migrateMindTrainData.js --execute
```

**Review this carefully:**
- Check document counts look correct
- Verify no errors or warnings
- Note how many documents will be migrated

---

## Step 5: Execute the Migration

**STOP your server first if it's running!**

Run the actual migration:

```bash
node scripts/migrateMindTrainData.js --execute
```

**Expected output:**
```
============================================================
MindTrain Data Migration Script
============================================================
⚠️  EXECUTION MODE - Data will be migrated
   Make sure you have a backup before proceeding!

[... connection messages ...]

============================================================
Migrating Collection: alarmprofiles
============================================================
Found X documents in source
Starting migration of X documents...
Migrated: X/X
✅ Migration complete: X documents migrated
   Target collection now has X documents

[... same for other collections ...]

============================================================
Migration Summary
============================================================
alarmprofiles: ✅ X migrated, 0 errors
fcmschedules: ✅ Y migrated, 0 errors
notificationlogs: ✅ Z migrated, 0 errors
synchealthlogs: ✅ W migrated, 0 errors

Total documents migrated: XXX

✅ Migration script completed
```

**If you see errors:**
- Note which collection had errors
- Check error messages carefully
- Most common: duplicate key errors (usually safe, means data already exists)

---

## Step 6: Verify the Migration

### 6.1 Check Database

Connect to your MongoDB and verify:

**Using MongoDB Compass or Atlas:**
1. Open the `mindtrain` database
2. Check these collections exist:
   - `alarmprofiles`
   - `fcmschedules`
   - `notificationlogs`
   - `synchealthlogs`
3. Verify document counts match the migration summary

### 6.2 Start Your Server

```bash
npm start
```

**What to look for:**
- ✅ Server starts successfully
- ✅ Both database connections established
- ✅ All routes load successfully
- ✅ No errors in console

### 6.3 Test MindTrain APIs

Test these endpoints (use Postman or your frontend):

**1. Get Alarm Profiles:**
```http
GET http://localhost:3000/api/mindtrain/alarm-profiles
Authorization: Bearer YOUR_JWT_TOKEN
```

Expected: Should return alarm profiles from new database

**2. Create Alarm Profile:**
```http
POST http://localhost:3000/api/mindtrain/alarm-profiles
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "id": "test-1234567890",
  "youtubeUrl": "https://www.youtube.com/watch?v=test",
  "title": "Test Alarm",
  "alarmsPerDay": 3,
  "selectedDaysPerWeek": [1, 2, 3, 4, 5],
  "startTime": "08:00:00",
  "endTime": "22:00:00",
  "isFixedTime": false,
  "isActive": true
}
```

Expected: Should create successfully

**3. Check Sync Status:**
```http
GET http://localhost:3000/api/mindtrain/alarm-profiles/:profileId/sync-status
Authorization: Bearer YOUR_JWT_TOKEN
```

Expected: Should return sync status

---

## Step 7: Monitor for Issues

For the next 24-48 hours, monitor:

1. **Server logs** - Watch for any database errors
2. **MindTrain features** - Ensure all functionality works
3. **User feedback** - Check if users report any issues

---

## Step 8: Cleanup (Optional - After 1 Week)

**Only after confirming everything works for at least a week:**

### Option 1: Keep Old Data (Recommended)
- Keep the old collections in the main database as backup
- No action needed

### Option 2: Remove Old Collections (Risky)
If you're **absolutely sure** everything works:

**Using MongoDB Compass/Atlas:**
1. Connect to your main database (`sanora`)
2. Drop these collections:
   - `alarmprofiles`
   - `fcmschedules`
   - `notificationlogs`
   - `synchealthlogs`

**Using MongoDB Shell:**
```javascript
use sanora
db.alarmprofiles.drop()
db.fcmschedules.drop()
db.notificationlogs.drop()
db.synchealthlogs.drop()
```

---

## Quick Reference Commands

```bash
# Test server (no migration)
npm start

# Dry-run migration (safe, no changes)
node scripts/migrateMindTrainData.js

# Execute migration (actual data move)
node scripts/migrateMindTrainData.js --execute

# Backup database
mongodump --uri="YOUR_URI" --out=./backup
```

---

## Troubleshooting

### Problem: "MindTrain database connection not initialized"
**Solution:** 
- Check `.env` file has `MONGODB_URI` set
- Restart server
- Check MongoDB Atlas IP whitelist

### Problem: "Duplicate key error" during migration
**Solution:** 
- This is usually safe - means some data already exists
- Check the error count in migration summary
- If only a few errors, likely okay

### Problem: Server won't start
**Solution:**
- Check all environment variables are set
- Look at the error message carefully
- Check MongoDB connection strings are correct

### Problem: Migration shows 0 documents
**Solution:**
- Collections might not exist in source database yet
- Check source database name is correct
- Verify you're connected to the right cluster

---

## Current Status

- ✅ Code changes complete
- ⏳ Waiting for you to:
  1. Add environment variable
  2. Test server startup
  3. Run migration

**Start with Step 1 above and work through each step in order.**

---

## Need Help?

If you get stuck:
1. Read the error message carefully
2. Check the troubleshooting section above
3. Review server logs
4. Check `MINDTRAIN_DATABASE_MIGRATION_GUIDE.md` for detailed info

