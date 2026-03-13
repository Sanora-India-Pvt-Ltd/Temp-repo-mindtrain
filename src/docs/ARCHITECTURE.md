# MindTrain Architecture Documentation

## Service Layer Architecture

### Overview

The MindTrain feature uses a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────┐
│         Controllers (API Layer)          │
│  (No changes - backward compatible)    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Service Wrappers (Thin Layer)      │
│  (Minimal changes - delegate to adapters)│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Adapters (Transformation Layer)     │
│  (NEW - handle old ↔ new format conversion)│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│    Core Service (Business Logic)         │
│  (NEW - unified operations on MindTrainUser)│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      MindTrainUser Model (Database)      │
│  (Unified nested schema)                 │
└──────────────────────────────────────────┘
```

## Core Service

**File:** `src/services/MindTrain/mindtrainUser.service.js`

### Responsibilities

- Unified CRUD operations on MindTrainUser
- MongoDB transaction support for atomic operations
- Cache invalidation hooks
- Comprehensive error handling
- Logging and metrics tracking

### Key Methods

```javascript
// Core CRUD
getMindTrainUser(userId)
createMindTrainUser(userId)

// Alarm Profiles
addAlarmProfile(userId, profileData)
updateAlarmProfile(userId, profileId, updates)
activateProfile(userId, profileId) // Atomic: deactivates others
deleteAlarmProfile(userId, profileId)

// FCM Schedule
updateFCMSchedule(userId, fcmUpdates)

// Logs
addNotificationLog(userId, notification)
addSyncHealthLog(userId, healthLog)
```

### Transaction Support

All multi-step operations use MongoDB transactions:

```javascript
const session = await connection.startSession();
session.startTransaction();
try {
    // Multiple operations
    await session.commitTransaction();
} catch (error) {
    await session.abortTransaction();
    throw error;
} finally {
    session.endSession();
}
```

## Adapter Layer

**Directory:** `src/services/MindTrain/adapters/`

### Purpose

Adapters bridge the gap between old API format and new unified model:

1. **Input:** Receive old format from controllers
2. **Transform:** Convert old → new format
3. **Execute:** Call core service methods
4. **Transform:** Convert new → old format
5. **Output:** Return old format to controllers

### Adapters

#### 1. AlarmProfileServiceAdapter

**File:** `src/services/MindTrain/adapters/alarmProfileServiceAdapter.js`

**Methods:**
- `getAlarmProfiles(userId)` - Returns old format with active/inactive separation
- `createOrUpdateAlarmProfile(profileData)` - Validates, transforms, creates/updates
- `updateActiveProfile(profileId, isActive)` - Atomic activation/deactivation
- `deleteAlarmProfile(userId, profileId)` - Handles cascade cleanup

#### 2. FCMScheduleServiceAdapter

**File:** `src/services/MindTrain/adapters/fcmScheduleServiceAdapter.js`

**Methods:**
- `getFCMSchedule(userId)` - Returns old format
- `createOrUpdateFCMSchedule(scheduleData)` - Validates times, transforms, updates
- `updateActiveProfileInSchedule(userId, profileId)` - Atomic update

#### 3. SyncHealthServiceAdapter

**File:** `src/services/MindTrain/adapters/syncHealthServiceAdapter.js`

**Methods:**
- `recordSyncHealth(healthData)` - Calculates health score, transforms, records
- `getSyncStatus(userId)` - Analyzes patterns, returns old format
- `detectSyncPatterns(userId)` - Intelligent pattern detection

## Service Wrappers

**Files:**
- `src/services/MindTrain/alarmProfileService.js`
- `src/services/MindTrain/fcmScheduleService.js`
- `src/services/MindTrain/syncHealthService.js`

### Implementation Pattern

```javascript
const Adapter = require('./adapters/[adapterName]');
const adapter = new Adapter(
    require('./mindtrainUser.service'),
    require('../../utils/logger'),
    require('../../utils/metrics'),
    require('../../utils/transformers')
);

// Export same interface (controllers don't change!)
module.exports = {
    getAlarmProfiles: (userId) => adapter.getAlarmProfiles(userId),
    createOrUpdateAlarmProfile: (profileData) => adapter.createOrUpdateAlarmProfile(profileData),
    // ... other methods
};
```

## Data Flow Example

### Creating an Alarm Profile

1. **Controller** receives request with old format
2. **Service Wrapper** delegates to adapter
3. **Adapter:**
   - Validates input (old format)
   - Transforms old → new format
   - Calls `mindtrainUserService.addAlarmProfile()`
   - Transforms response new → old format
4. **Core Service:**
   - Uses transaction
   - Updates MindTrainUser document
   - Auto-updates metadata
5. **Adapter** returns old format response
6. **Controller** sends response (unchanged format)

## Error Handling

### Error Classes

Custom error classes in `src/utils/errors.js`:

- `ProfileCreationError` (400)
- `ProfileNotFoundError` (404)
- `ValidationError` (400)
- `DatabaseError` (500)
- `ConcurrencyError` (409)
- `UserNotFoundError` (404)

### Error Flow

1. Adapter catches errors from core service
2. Maps to appropriate HTTP status codes
3. Formats error response matching old format
4. Logs error with context

## Caching Strategy

- Cache key: `mindtrain:user:${userId}`
- TTL: 5 minutes (configurable)
- Invalidation: On any write operation
- Feature flag: `ENABLE_CACHING`

## Monitoring & Observability

### Metrics Tracked

- Query duration (histogram)
- Success/error rates (counters)
- Cache hits/misses (counters)
- Active users (gauge)

### Logging

- Structured logging with context
- Request/response logging (optional)
- Error logging with stack traces
- Performance logging for slow queries

## Configuration

**File:** `src/config/mindtrain.config.js`

### Key Settings

- `USE_UNIFIED_MODEL` - Feature flag
- `MAX_NOTIFICATION_LOGS` - Log rotation limit (default: 100)
- `MAX_SYNC_HEALTH_LOGS` - Log rotation limit (default: 50)
- `CACHE.TTL` - Cache time-to-live (default: 300s)
- `DATABASE.QUERY_TIMEOUT` - Query timeout (default: 30s)

## Testing Strategy

### Unit Tests

- Adapter transformation logic
- Core service methods
- Error handling
- Data validation

### Integration Tests

- Complete user flows
- Backward compatibility
- Concurrent operations
- Transaction rollback

### Performance Tests

- Query latency
- Concurrent load
- Cache effectiveness

