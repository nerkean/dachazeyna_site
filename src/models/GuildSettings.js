import mongoose from 'mongoose';

const guildSettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    prefix: { type: String, default: '!' },
    muteRoleId: { type: String, default: null },
    moderatorRoleIds: { type: [String], default: [] },
    supporterRoleId: { type: String, default: null },
    sponsorRoleId: { type: String, default: null },
    legendRoleId: { type: String, default: null },
    verifyRoleId: { type: String, default: null }
}, { timestamps: true });

export default mongoose.model('GuildSettings', guildSettingsSchema);