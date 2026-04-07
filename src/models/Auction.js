import mongoose from 'mongoose';

const auctionSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    guildId: { type: String, required: true },
    sellerId: { type: String, required: true },
    itemId: { type: String, required: true },
    amount: { type: Number, required: true },
    startingPrice: { type: Number, required: true },
    currentBid: { type: Number, required: true },
    highestBidderId: { type: String, default: null },
    endTime: { type: Date, required: true },
    ended: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Auction', auctionSchema);