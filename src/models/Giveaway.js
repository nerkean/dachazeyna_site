import mongoose from 'mongoose';

const giveawaySchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    guildId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    prize: { type: String, required: true },
    winnersCount: { type: Number, required: true },
    endTime: { type: Date, required: true },
    participants: { type: [String], default: [] },
    forcedWinners: { type: [String], default: [] },
    ended: { type: Boolean, default: false }
});

export default mongoose.model('Giveaway', giveawaySchema);