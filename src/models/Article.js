import mongoose from 'mongoose';

const articleSchema = new mongoose.Schema({
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true }, 
    content: { type: String, required: true }, 

    attachments: [{
        name: String,
        path: String 
    }],
    
    category: { 
        type: String, 
        required: true, 
        enum: ['guides', 'bees', 'items', 'mechanics', 'server'] 
    },
    
    icon: { type: String, default: 'fas fa-book' }, 
    image: { type: String, default: null }, 
    
    author: { type: String, default: 'Команда Server' },
    views: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    
    tags: [String]
}, { timestamps: true });

export default mongoose.model('Article', articleSchema);