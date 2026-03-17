require('dotenv').config();

const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');

const { connectMindTrainDB, closeMindTrainDB } = require('./src/config/dbMindTrain');
const { mindtrainErrorHandler } = require('./src/middleware/mindtrainErrorHandler');

const app = express();

// Basic middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple request logger (API only)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`📥 ${req.method} ${req.path}`);
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'mindtrain',
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Use a dedicated MindTrain port so it can run alongside the main backend.
// Prefer MINDTRAIN_PORT to avoid clashing with the monolith's PORT (typically 3100).
const PORT = process.env.MINDTRAIN_PORT || 3200;

// Start server after connecting to main DB (for User/auth) and MindTrain DB
(async () => {
  try {
    // Default mongoose connection: required for User model used by auth middleware
    const mainUri = process.env.MONGODB_URI;
    if (!mainUri) {
      throw new Error('MONGODB_URI is required in .env for auth (User model)');
    }
    await mongoose.connect(mainUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Main MongoDB connected (auth/User)');

    await connectMindTrainDB();

    // MindTrain routes (same external paths as monolith)
    try {
      console.log('🔄 Loading MindTrain alarm profile routes...');
      const alarmProfileRoutes = require('./src/routes/MindTrain/alarmProfile.routes');
      app.use('/api/mindtrain', alarmProfileRoutes);
      console.log('✅ MindTrain alarm profile routes loaded');
    } catch (error) {
      console.error('❌ Failed to load MindTrain alarm profile routes:', error);
    }

    try {
      console.log('🔄 Loading MindTrain sync health routes...');
      const syncHealthRoutes = require('./src/routes/MindTrain/syncHealth.routes');
      app.use('/api/mindtrain/alarm-profiles', syncHealthRoutes);
      console.log('✅ MindTrain sync health routes loaded');
    } catch (error) {
      console.error('❌ Failed to load MindTrain sync health routes:', error);
    }

    try {
      console.log('🔄 Loading MindTrain FCM notification routes...');
      const fcmNotificationRoutes = require('./src/routes/MindTrain/fcmNotification.routes');
      app.use('/api/mindtrain/fcm-notifications', fcmNotificationRoutes);
      console.log('✅ MindTrain FCM notification routes loaded');
    } catch (error) {
      console.error('❌ Failed to load MindTrain FCM notification routes:', error);
    }

    try {
      console.log('🔄 Loading MindTrain unified user routes...');
      const mindtrainUserRoutes = require('./src/routes/MindTrain/mindtrainUser.routes');
      app.use('/api/mindtrain', mindtrainUserRoutes);
      console.log('✅ MindTrain unified user routes loaded');
    } catch (error) {
      console.error('❌ Failed to load MindTrain unified user routes:', error);
    }

    // 404 handler for unknown MindTrain routes (must be AFTER routes)
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/mindtrain')) {
        return res.status(404).json({
          success: false,
          message: 'Route not found in MindTrain service',
          path: req.path,
          method: req.method
        });
      }
      next();
    });

    // MindTrain-specific error handler (for MindTrainError and subclasses)
    app.use(mindtrainErrorHandler);

    // Generic fallback error handler
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
      console.error('Unhandled error in MindTrain service:', err);
      res.status(500).json({
        success: false,
        message: 'Internal server error in MindTrain service'
      });
    });

    const server = app.listen(PORT, () => {
      console.log(`\n🎯 MindTrain service running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('📍 Base path: /api/mindtrain');
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n🛑 ${signal} received, shutting down MindTrain service...`);
      server.close(async () => {
        await closeMindTrainDB();
        if (mongoose.connection.readyState === 1) {
          await mongoose.disconnect();
          console.log('✅ Main MongoDB disconnected');
        }
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start MindTrain service:', error);
    process.exit(1);
  }
})();

