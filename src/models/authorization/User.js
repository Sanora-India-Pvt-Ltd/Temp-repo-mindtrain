const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    profile: {
        name: {
            first: {
                type: String,
                required: false // Required only for non-OAuth signups (validated in controller)
            },
            last: {
                type: String,
                required: false // Required only for non-OAuth signups (validated in controller)
            },
            full: {
                type: String,
                default: ''
            }
        },
        email: {
            type: String,
            required: false, // Required only for non-OAuth signups (validated in controller)
            unique: true,
            sparse: true,
            lowercase: true
        },
        phoneNumbers: {
            primary: {
                type: String,
                required: false
            },
            alternate: {
                type: String,
                required: false,
                default: undefined
            }
        },
        gender: {
            type: String,
            required: false, // Required only for non-OAuth signups (validated in controller)
            enum: ['Male', 'Female', 'Other', 'Prefer not to say']
        },
        bio: {
            type: String,
            default: ''
        },
        profileImage: {
            type: String,
            default: ''
        },
        coverPhoto: {
            type: String,
            default: ''
        },
        pronouns: {
            type: String,
            default: ''
        },
        dob: {
            type: Date,
            required: false
        },
        visibility: {
            type: String,
            enum: ['public', 'private'],
            default: 'public'
        }
    },
    auth: {
        password: {
            type: String,
            required: false // Not required for OAuth users
        },
        isGoogleOAuth: {
            type: Boolean,
            default: false
        },
        googleId: {
            type: String,
            unique: true,
            sparse: true
        },
        tokens: {
            refreshTokens: [{
                token: {
                    type: String,
                    required: true
                },
                expiresAt: {
                    type: Date,
                    required: true
                },
                device: {
                    type: String,
                    default: 'Unknown Device'
                },
                createdAt: {
                    type: Date,
                    default: Date.now
                }
            }]
        }
    },
    account: {
        isActive: {
            type: Boolean,
            default: true
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        lastLogin: {
            type: Date,
            default: null
        }
    },
    role: {
        type: String,
        enum: ['USER', 'HOST', 'SPEAKER', 'SUPER_ADMIN', 'admin'],
        default: 'USER'
    },
    social: {
        friends: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        blockedUsers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        relationshipStatus: {
            type: String,
            required: false,
            enum: ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'],
            default: null
        }
    },
    location: {
        currentCity: {
            type: String,
            default: ''
        },
        hometown: {
            type: String,
            default: ''
        }
    },
    professional: {
        workplace: [{
            company: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Company',
                required: true
            },
            position: {
                type: String,
                required: true
            },
            description: {
                type: String,
                trim: true,
                default: ''
            },
            startDate: {
                type: Date,
                required: true
            },
            endDate: {
                type: Date,
                default: null
            },
            isCurrent: {
                type: Boolean,
                default: false
            }
        }],
        education: [{
            institution: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Institution',
                required: false
            },
            description: {
                type: String,
                trim: true,
                default: ''
            },
            degree: {
                type: String,
                default: ''
            },
            field: {
                type: String,
                default: ''
            },
            institutionType: {
                type: String,
                enum: ['school', 'college', 'university', 'others'],
                default: 'school'
            },
            startMonth: {
                type: Number,
                min: 1,
                max: 12,
                required: false
            },
            startYear: {
                type: Number,
                required: false
            },
            endMonth: {
                type: Number,
                min: 1,
                max: 12,
                default: null
            },
            endYear: {
                type: Number,
                default: null
            },
            cgpa: {
                type: Number,
                min: 0,
                max: 10,
                default: null
            },
            percentage: {
                type: Number,
                min: 0,
                max: 100,
                default: null
            }
        }]
    },
    content: {
        generalWeightage: {
            type: Number,
            default: 0
        },
        professionalWeightage: {
            type: Number,
            default: 0
        }
    }

//     marketplace: {
//   sellerStatus: {
//     type: String,
//     enum: ['none', 'pending', 'approved', 'rejected', 'suspended'],
//     default: 'none'
//   },
//   sellerRating: {
//     type: Number,
//     default: 0
//   },
//   sellerSince: {
//     type: Date
//   }
// }
}, {
    timestamps: true
});

// Pre-save hook to update last login and handle authentication token migration
userSchema.pre('save', async function() {
    try {
        // Update last login timestamp
        if (this.account) {
            this.account.lastLogin = new Date();
        }
    } catch (error) {
        throw error;
    }
});

module.exports = mongoose.model('User', userSchema);
