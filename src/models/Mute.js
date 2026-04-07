import mongoose from 'mongoose';

const muteSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    moderatorId: { type: String, required: true },
    reason: { type: String, default: 'Причина не указана' },
    expiresAt: { type: Date, default: null },
    hasAppealed: { type: Boolean, default: false }
}, { timestamps: true });

muteSchema.index({ userId: 1, guildId: 1 });
muteSchema.index({ expiresAt: 1 });

export default mongoose.model('Mute', muteSchema);