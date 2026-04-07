import mongoose from 'mongoose';

const marketAlertSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('MarketAlert', marketAlertSchema);