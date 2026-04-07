import mongoose from 'mongoose';

const customRoleSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    roleId: { type: String, required: true },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

export default mongoose.model('CustomRole', customRoleSchema);