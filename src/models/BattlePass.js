import mongoose from 'mongoose';

const battlePassSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
    claimedRewards: { type: [Number], default: [] }
}, { timestamps: true });

battlePassSchema.index({ userId: 1, guildId: 1 }, { unique: true });

export default mongoose.model('BattlePass', battlePassSchema);