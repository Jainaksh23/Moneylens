import mongoose, { Schema, Document } from 'mongoose';

export type TransactionDirection = 'income' | 'expense';
export type CategorySource = 'model' | 'user' | 'rule' | 'unknown';
export type TransactionSource = 'manual' | 'csv' | 'pdf';

export interface ITransaction extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  date: Date;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  merchant: string;
  description: string;
  category: string;
  categorySource: CategorySource;
  categoryConfidence?: number | null;
  modelVersion?: string | null;
  source: TransactionSource;
  fingerprint: string;
  isDuplicate: boolean;
  needsReview: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Transaction date is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be a positive number'],
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    direction: {
      type: String,
      enum: {
        values: ['income', 'expense'],
        message: '{VALUE} is not a valid direction (must be income or expense)',
      },
      required: [true, 'Direction is required'],
      index: true,
    },
    merchant: {
      type: String,
      default: 'unknown',
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    category: {
      type: String,
      default: 'unknown',
      trim: true,
      index: true,
    },
    categorySource: {
      type: String,
      enum: ['model', 'user', 'rule', 'unknown'],
      default: 'unknown',
    },
    categoryConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    modelVersion: {
      type: String,
      default: null,
    },
    source: {
      type: String,
      enum: ['manual', 'csv', 'pdf'],
      required: true,
      default: 'manual',
    },
    fingerprint: {
      type: String,
      required: [true, 'Fingerprint is required'],
      index: true,
    },
    isDuplicate: {
      type: Boolean,
      default: false,
    },
    needsReview: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for high performance querying & aggregation
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, fingerprint: 1 });
transactionSchema.index({ userId: 1, category: 1 });
transactionSchema.index({ userId: 1, direction: 1 });
transactionSchema.index({ userId: 1, needsReview: 1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
