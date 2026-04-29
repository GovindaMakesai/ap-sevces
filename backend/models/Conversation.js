const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
    {
        participants: {
            type: [String],
            required: true,
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length >= 2,
                message: 'At least two participants are required'
            }
        },
        lastMessageText: {
            type: String,
            default: ''
        },
        lastMessageAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
