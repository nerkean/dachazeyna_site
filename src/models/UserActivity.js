import mongoose from 'mongoose';

const userActivitySchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    date: { type: String, required: true },
    messages: { type: Number, default: 0 },
    voiceMinutes: { type: Number, default: 0 },
    starsEarned: { type: Number, default: 0 }
}, { timestamps: true });

userActivitySchema.index({ userId: 1, guildId: 1, date: 1 }, { unique: true });

export default mongoose.model('UserActivity', userActivitySchema);