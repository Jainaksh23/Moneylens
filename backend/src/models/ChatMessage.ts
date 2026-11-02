import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IChatEvidence {
  type: 'knowledge' | 'user_data';
  source: string;
  period?: string;
  details?: Record<string, any>;
}

export interface IChatMessage extends Document {
  userId: Types.ObjectId;
  role: 'user' | 'assistant';
  content: string;
  evidence: IChatEvidence[];
  limitations?: string;
  disclaimer?: string;
  toolsUsed: string[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ChatEvidenceSchema = new Schema<IChatEvidence>(
  {
    type: { type: String, enum: ['knowledge', 'user_data'], required: true },
    source: { type: String, required: true },
    period: { type: String },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    evidence: { type: [ChatEvidenceSchema], default: [] },
    limitations: { type: String },
    disclaimer: { type: String },
    toolsUsed: { type: [String], default: [] },
    tokenUsage: {
      promptTokens: { type: Number },
      completionTokens: { type: Number },
      totalTokens: { type: Number },
    },
  },
  {
    timestamps: true,
  }
);

ChatMessageSchema.index({ userId: 1, createdAt: -1 });

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
