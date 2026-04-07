import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
    itemId: { type: String, required: true },
    amount: { type: Number, default: 1 },
    acquiredAt: { type: Date, default: Date.now }
}, { _id: false });

const userProfileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    username: { type: String, required: true },
    avatar: { type: String, default: null },
    joinedAt: { type: Date, required: true },
    mutesIssued: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    ips: { type: [String], default: [] },
    isVerified: { type: Boolean, default: false },
    firstLoginAt: { type: Date },
    stars: { type: Number, default: 0 },
    inventory: { type: [inventoryItemSchema], default: [] },
    activeBackground: { type: String, default: null },
    activeFrame: { type: String, default: null },
    skipLootboxAnimation: { type: Boolean, default: false },
    xpMultiplier: { type: Number, default: 1 },
    xpMultiplierExpiresAt: { type: Date, default: null },
    starsMultiplier: { type: Number, default: 1 },
    starsMultiplierExpiresAt: { type: Date, default: null },
    luckMultiplier: { type: Number, default: 1 },
    luckMultiplierExpiresAt: { type: Date, default: null },
    antiMuteShields: { type: Number, default: 0 },
    lastDailyAt: { type: Date, default: null },
    dailyStreak: { type: Number, default: 0 },
    totalMessages: { type: Number, default: 0 },
    totalVoiceMinutes: { type: Number, default: 0 },
    muteNotificationsDisabled: { type: Boolean, default: false },
    transferNotifDisabled: { type: Boolean, default: false },
    dailyNotifEnabled: { type: Boolean, default: false }, 
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    gamesPlayedToday: { type: Number, default: 0 },
    lastGameAt: { type: Date, default: null },
    reputation: { type: Number, default: 0 },
    lastReputationGivenAt: { type: Date, default: null },
    isWikiEditor: { type: Boolean, default: false }
}, { 
    timestamps: true,
    collection: 'user_profiles'
});

userProfileSchema.index({ userId: 1, guildId: 1 }, { unique: true });

const UserProfile = mongoose.model('UserProfile', userProfileSchema);
export default UserProfile;