import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    senderId: { type: String, required: true, index: true },
    receiverId: { type: String, required: true, index: true },
    content: { type: String, default: '' },
    imageUrl: { type: String, default: null }, 
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ createdAt: -1 });

export default mongoose.model('Message', messageSchema);