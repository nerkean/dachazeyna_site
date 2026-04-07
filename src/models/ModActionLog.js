import mongoose from 'mongoose';

const modActionLogSchema = new mongoose.Schema({
    moderatorId: { type: String, required: true },
    guildId: { type: String, required: true },
    actionType: { type: String, required: true },
    targetId: { type: String, required: true },
    date: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('ModActionLog', modActionLogSchema);