const jwt = require('jsonwebtoken');
const User = require('../models/authorization/User');
const crypto = require('crypto');

// Generate Access Token (short-lived - 1 hour for better UX, still secure)
const generateAccessToken = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' } // 1 hour - balances security and user experience
    );
};

// Generate Refresh Token (never expires - only invalidated on explicit logout)
const generateRefreshToken = () => {
    const token = crypto.randomBytes(40).toString('hex'); // Secure random token
    // Set expiry to 100 years from now (effectively never expires)
    // Tokens are only invalidated when user explicitly logs out
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 100); // 100 years from now (effectively never expires)
    return { token, expiryDate };
};

// Legacy function for backward compatibility (now generates access token)
const generateToken = (payload) => {
    return generateAccessToken(payload);
};

const protect = async (req, res, next) => {
    try {
        let token;
        
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            // Exclude auth section for security - never expose auth data in req.user
            const user = await User.findById(decoded.id).select('-auth');
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            req.user = user;
            req.userId = user._id; // Also set userId for convenience
            next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token failed'
            });
        }
    } catch (error) {
        next(error);
    }
};

// Verify refresh token
const verifyRefreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Find user by refresh token (nested structure only)
        const user = await User.findOne({ 'auth.tokens.refreshTokens.token': refreshToken });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        const tokenRecord = user.auth?.tokens?.refreshTokens?.find(rt => rt.token === refreshToken);
        if (!tokenRecord) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
};

module.exports = {
    generateToken,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    protect
};
