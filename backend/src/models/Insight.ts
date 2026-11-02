import mongoose, { Schema, Document } from 'mongoose';

export type InsightType = 'anomaly' | 'recommendation' | 'recurring';
export type InsightSeverity = 'low' | 'medium' | 'high';
export type InsightStatus = 'open' | 'expected' | 'incorrect' | 'dismissed';

export interface IInsight extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: InsightType;
  period: string;
  severity: InsightSeverity;
  explanation: string;
  evidence: Record<string, unknown>;
  status: InsightStatus;
  modelVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const insightSchema = new Schema<IInsight>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['anomaly', 'recommendation', 'recurring'],
        message: '{VALUE} is not a valid insight type',
      },
      required: [true, 'Insight type is required'],
      index: true,
    },
    period: {
      type: String,
      required: [true, 'Period is required'],
      trim: true,
    },
    severity: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high'],
        message: '{VALUE} is not a valid severity level',
      },
      default: 'medium',
    },
    explanation: {
      type: String,
      required: [true, 'Explanation is required'],
      trim: true,
    },
    evidence: {
      type: Schema.Types.Mixed,
      required: [true, 'Evidence is required'],
    },
    status: {
      type: String,
      enum: {
        values: ['open', 'expected', 'incorrect', 'dismissed'],
        message: '{VALUE} is not a valid status',
      },
      default: 'open',
      index: true,
    },
    modelVersion: {
      type: String,
      required: [true, 'Model version is required'],
      default: '1.0.0',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

insightSchema.index({ userId: 1, type: 1, status: 1 });
insightSchema.index({ userId: 1, 'evidence.transactionId': 1 }, { sparse: true });

export const Insight = mongoose.model<IInsight>('Insight', insightSchema);
