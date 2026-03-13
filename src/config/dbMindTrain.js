const mongoose = require('mongoose');

// Separate connection instance for MindTrain database
let mindTrainConnection = null;

/**
 * Connect to MindTrain Database
 * Creates a separate MongoDB connection for MindTrain collections
 * 
 * Uses MONGODB_URI_MINDTRAIN environment variable.
 * If not set, falls back to MONGODB_URI with database name changed to 'mindtrain'
 */
const connectMindTrainDB = async () => {
    try {
        // If connection already exists and is ready, return it
        if (mindTrainConnection && mindTrainConnection.readyState === 1) {
            console.log('✅ MindTrain DB connection already established');
            return mindTrainConnection;
        }

        // Determine connection URI
        let connectionURI;
        if (process.env.MONGODB_URI_MINDTRAIN) {
            connectionURI = process.env.MONGODB_URI_MINDTRAIN;
        } else if (process.env.MONGODB_URI) {
            // Fallback: Use main URI but change database name to 'mindtrain'
            // Extract database name from URI and replace it
            const mainURI = process.env.MONGODB_URI;
            // Replace database name in URI (handles both /database and /database? cases)
            // Match pattern: /databaseName?query or /databaseName
            connectionURI = mainURI.replace(/\/([^/?]+)(\?|$)/, (match, dbName, query) => {
                return '/mindtrain' + (query || '');
            });
            console.log('⚠️  MONGODB_URI_MINDTRAIN not set, using MONGODB_URI with database name "mindtrain"');
        } else {
            console.error('❌ Neither MONGODB_URI_MINDTRAIN nor MONGODB_URI is defined');
            console.error('💡 Set MONGODB_URI_MINDTRAIN in your .env file');
            throw new Error('MindTrain database connection URI not configured');
        }

        // Log connection attempt (without showing password)
        const uriWithoutPassword = connectionURI.replace(/:[^:@]+@/, ':****@');
        console.log(`🔄 Attempting to connect to MindTrain MongoDB...`);
        console.log(`📍 Connection string: ${uriWithoutPassword}`);

        // Create separate connection using createConnection
        mindTrainConnection = mongoose.createConnection(connectionURI, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        });

        // Wait for connection to be established
        await mindTrainConnection.asPromise();
        
        console.log(`✅ MindTrain MongoDB Connected to database: ${mindTrainConnection.name}`);
        console.log(`📍 Host: ${mindTrainConnection.host}`);

        // Handle connection events
        mindTrainConnection.on('error', (error) => {
            console.error('❌ MindTrain MongoDB connection error:', error.message);
        });

        mindTrainConnection.on('disconnected', () => {
            console.warn('⚠️  MindTrain MongoDB disconnected');
        });

        mindTrainConnection.on('reconnected', () => {
            console.log('✅ MindTrain MongoDB reconnected');
        });

        return mindTrainConnection;
    } catch (error) {
        console.error('❌ MindTrain MongoDB connection failed!');
        console.error('Error details:', error.message);
        
        // Provide helpful error messages
        if (error.message.includes('authentication failed')) {
            console.error('💡 Authentication failed - Check your username and password');
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
            console.error('💡 DNS/Network error - Check your cluster URL');
        } else if (error.message.includes('timeout')) {
            console.error('💡 Connection timeout - Check your network and MongoDB Atlas IP whitelist');
        } else if (error.message.includes('bad auth')) {
            console.error('💡 Bad authentication - Verify username and password are correct');
        }
        
        console.error('\n📋 Troubleshooting steps:');
        console.error('1. Verify MONGODB_URI_MINDTRAIN in your .env file (or MONGODB_URI as fallback)');
        console.error('2. Check MongoDB Atlas Network Access (IP whitelist)');
        console.error('3. Verify username and password are correct');
        console.error('4. Ensure MongoDB Atlas cluster is running');
        console.error('5. Check if password has special characters that need URL encoding');
        
        // Don't exit process - let main DB connection handle that
        throw error;
    }
};

/**
 * Get the MindTrain connection instance
 * Returns null if not connected
 */
const getMindTrainConnection = () => {
    return mindTrainConnection;
};

/**
 * Close MindTrain database connection
 */
const closeMindTrainDB = async () => {
    if (mindTrainConnection) {
        await mindTrainConnection.close();
        mindTrainConnection = null;
        console.log('✅ MindTrain MongoDB connection closed');
    }
};

module.exports = {
    connectMindTrainDB,
    getMindTrainConnection,
    closeMindTrainDB
};

