import mongoose from 'mongoose';

const marriageSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    partner1Id: { type: String, required: true },
    partner2Id: { type: String, required: true },
    marriedAt: { type: Date, default: Date.now },
    familyBalance: { type: Number, default: 0 }
}, { timestamps: true });

marriageSchema.index({ userIds: 1, guildId: 1 });

export default mongoose.model('Marriage', marriageSchema);