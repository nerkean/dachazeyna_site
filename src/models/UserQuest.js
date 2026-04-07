import mongoose from 'mongoose';

const userQuestSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    questId: { type: String, required: true },
    progress: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null }
}, { timestamps: true });

userQuestSchema.index({ userId: 1, questId: 1, guildId: 1 }, { unique: true });

export default mongoose.model('UserQuest', userQuestSchema);