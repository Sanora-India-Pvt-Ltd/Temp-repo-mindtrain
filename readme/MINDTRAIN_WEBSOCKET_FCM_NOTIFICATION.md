# MindTrain WebSocket-Based FCM Notification System

## Overview

A broadcast-only notification system that delivers MindTrain sync notifications to ALL users via WebSocket when the app is open (real-time) and FCM push notifications when the app is closed (reliable delivery).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CRON JOB (Every 5 minutes)                             │
│  └─ Broadcasts notifications to all users                │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  BROADCAST NOTIFICATION SERVICE                          │
│  ├─ Step 1: Broadcast via Socket.IO                     │
│  │   └─ All connected users receive instantly            │
│  └─ Step 2: Broadcast via FCM                            │
│      └─ All users in database receive push notification  │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. Notification Service
**File:** `src/services/MindTrain/mindTrainNotification.service.js`

**Function:** `broadcastMindTrainNotification()`

**Features:**
- Broadcasts to all users via Socket.IO (connected users)
- Broadcasts to all users via FCM push (all users in database)
- Logs broadcast statistics
- Handles errors gracefully

**Usage:**
```javascript
const { broadcastMindTrainNotification } = require('./services/MindTrain/mindTrainNotification.service');

await broadcastMindTrainNotification({
    profileId: 'profile456', // optional
    notificationType: 'morning', // or 'evening'
    scheduleId: 'schedule789' // optional
});
```

### 2. Cron Job
**File:** `src/jobs/MindTrain/fcmNotificationJob.js`

**Schedule:** Every 5 minutes (`*/5 * * * *`)

**Features:**
- Broadcasts morning and evening notifications to all users
- Processes in parallel for efficiency
- Prevents concurrent executions
- Comprehensive logging with broadcast statistics

**Manual Execution:**
```javascript
const fcmJob = require('./jobs/MindTrain/fcmNotificationJob');
fcmJob.runJob(); // Run manually for testing
```

### 3. WebSocket Event
**Event Name:** `mindtrain:sync_notification`

**Broadcast:** Sent to all connected sockets (no specific room)

**Payload:**
```json
{
  "profileId": "profile456",
  "notificationType": "morning",
  "syncSource": "fcm",
  "broadcast": true,
  "title": "MindTrain Sync",
  "body": "Checking alarm schedule (morning)",
  "timestamp": "2025-01-31T10:00:00.000Z"
}
```

## Client Integration

### Flutter/Dart Example

```dart
// Connect to WebSocket
final socket = io('wss://your-api.com', {
  'auth': {'token': userJwtToken}
});

// Listen for MindTrain notifications
socket.on('mindtrain:sync_notification', (data) {
  print('Received sync notification: $data');
  
  // Trigger sync check
  checkSyncStatus();
  
  // Update UI
  updateSyncIndicator();
});
```

### JavaScript/Web Example

```javascript
import io from 'socket.io-client';

const socket = io('wss://your-api.com', {
  auth: { token: userJwtToken }
});

socket.on('mindtrain:sync_notification', (data) => {
  console.log('Sync notification received:', data);
  
  // Trigger sync check
  checkSyncStatus();
});
```

## Flow

1. **Cron Job Runs** (every 5 minutes)
   - Checks if current time is within notification windows
   - Morning window: 6:00 AM - 10:00 AM UTC
   - Evening window: 6:00 PM - 10:00 PM UTC

2. **Broadcast Notification:**
   - **Socket.IO Broadcast:** Emit `mindtrain:sync_notification` to all connected sockets
   - **FCM Broadcast:** Send push notifications to all users in database (batched)

3. **Statistics:**
   - Track socket broadcast count (connected users)
   - Track FCM processed count (all users)
   - Track FCM failed count (failed deliveries)

## Benefits

✅ **Real-time Delivery:** Instant when app is open (WebSocket)  
✅ **Reliable Delivery:** Always works when app is closed (FCM)  
✅ **Single Code Path:** One service handles both methods  
✅ **Comprehensive Logging:** All notifications tracked  
✅ **Error Handling:** Graceful fallbacks and error recovery  

## Configuration

### Cron Schedule
Default: Every 5 minutes (`*/5 * * * *`)

To change, edit `src/jobs/MindTrain/fcmNotificationJob.js`:
```javascript
job = cron.schedule('*/10 * * * *', runJob, { // Every 10 minutes
    scheduled: true,
    timezone: 'UTC'
});
```

### Notification Windows
Default notification windows:
- Morning: 6:00 AM - 10:00 AM UTC
- Evening: 6:00 PM - 10:00 PM UTC

To change, edit `src/jobs/MindTrain/fcmNotificationJob.js`:
```javascript
const NOTIFICATION_WINDOWS = {
    morning: {
        startHour: 6,  // 6:00 AM UTC
        endHour: 10    // 10:00 AM UTC
    },
    evening: {
        startHour: 18, // 6:00 PM UTC
        endHour: 22    // 10:00 PM UTC
    }
};
```

## Testing

### Manual Test
```javascript
const fcmJob = require('./jobs/MindTrain/fcmNotificationJob');

// Run job manually
fcmJob.runJob().then(result => {
    console.log('Job result:', result);
});
```

### Check Job Status
```javascript
const fcmJob = require('./jobs/MindTrain/fcmNotificationJob');

console.log(fcmJob.getStatus());
// { isRunning: false, isScheduled: true, schedule: '*/5 * * * * (every 5 minutes)' }
```

### Test Broadcast Notification Service
```javascript
const { broadcastMindTrainNotification } = require('./services/MindTrain/mindTrainNotification.service');

await broadcastMindTrainNotification({
    profileId: 'test_profile_id', // optional
    notificationType: 'morning'
});
```

Or use the test endpoint:
```bash
POST /api/mindtrain/fcm-notifications/test
{
  "notificationType": "morning",
  "profileId": "optional_profile_id"
}
```

## Monitoring

### Logs
Check server logs for:
- `[FCMJob]` - Cron job execution logs
- `[MindTrainNotification]` - Notification delivery logs

### Database
Check `NotificationLog` collection for:
- All sent notifications
- Delivery method (websocket/fcm)
- Delivery status (delivered/sent/failed)
- Timestamps

## Troubleshooting

### Notifications Not Sending

1. **Check Cron Job Status:**
   ```javascript
   const fcmJob = require('./jobs/MindTrain/fcmNotificationJob');
   console.log(fcmJob.getStatus());
   ```

2. **Check Notification Windows:**
   - Verify cron job is running during notification windows
   - Check UTC time matches notification windows

3. **Check WebSocket:**
   - Verify Socket.IO is initialized
   - Check if any users are connected (broadcast goes to all)

4. **Check FCM:**
   - Verify Firebase is configured
   - Check DeviceToken collection for active tokens

### WebSocket Not Working

- Ensure Socket.IO is initialized before cron job starts
- Verify broadcast events are being emitted (check logs)
- Check that clients are listening for `mindtrain:sync_notification` event

### FCM Not Working

- Check Firebase configuration in `src/config/firebase.js`
- Verify DeviceToken entries exist and are active
- Check Firebase service account credentials

## Files Created/Modified

### New Files
- `src/services/MindTrain/mindTrainNotification.service.js` - Notification service
- `src/jobs/MindTrain/fcmNotificationJob.js` - Cron job
- `readme/MINDTRAIN_WEBSOCKET_FCM_NOTIFICATION.md` - This documentation

### Modified Files
- `src/server.js` - Added cron job initialization

## Next Steps

1. **Client Integration:** Add WebSocket listener in Flutter app
2. **Testing:** Test with real users and schedules
3. **Monitoring:** Set up alerts for failed notifications
4. **Optimization:** Adjust cron schedule and notification window as needed

---

**Status:** ✅ Implemented and ready for testing

