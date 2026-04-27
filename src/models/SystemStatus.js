import mongoose from 'mongoose';

const systemStatusSchema = new mongoose.Schema({
    type: { type: String, enum: ['incident'], required: true, default: 'incident' },
    service: { type: String, enum: ['site', 'bot', 'database'], required: true },
    status: { type: String, enum: ['offline', 'degraded'], required: true },
    message: { type: String, required: true },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date }
}, { 
    timestamps: true 
});

export default mongoose.model('SystemStatus', systemStatusSchema);