import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    userId: { type: String, required: true, index: true }, 
    type: { type: String, enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR'], default: 'INFO' },
    message: { type: String, required: true },
    link: { type: String }, 
    read: { type: Boolean, default: false }, 
    createdAt: { type: Date, default: Date.now, expires: 604800 }
});

export default mongoose.model('Notification', schema);