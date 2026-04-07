import mongoose from 'mongoose';

const banAppealSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    banReason: { type: String, default: 'Не указана' },
    appealText: { type: String, required: true, maxlength: 1000 },
    status: { 
        type: String, 
        enum: ['PENDING', 'APPROVED', 'REJECTED'], 
        default: 'PENDING' 
    },
    adminComment: { type: String, default: null }, 
    handledBy: { type: String, default: null }, 
    handledAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('BanAppeal', banAppealSchema);