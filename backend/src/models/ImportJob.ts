import mongoose, { Schema } from 'mongoose';

export interface ImportErrorItem {
  row: number;
  message: string;
  raw?: string;
}

export interface ImportCandidate {
  date: Date;
  amount: number;
  currency: string;
  direction: 'income' | 'expense';
  merchant: string;
  description: string;
  category: string;
  categorySource: 'model' | 'user' | 'rule' | 'unknown';
  source: 'csv' | 'pdf';
  fingerprint: string;
  isDuplicate: boolean;
}

export interface IImportJob {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  filename: string;
  status: 'pending' | 'preview' | 'completed' | 'failed';
  counts: {
    accepted: number;
    rejected: number;
    duplicates: number;
  };
  errors: ImportErrorItem[];
  previewTransactions?: ImportCandidate[];
  startedAt: Date;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const importJobSchema = new Schema<IImportJob>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    filename: {
      type: String,
      required: [true, 'Filename is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'preview', 'completed', 'failed'],
      default: 'preview',
      index: true,
    },
    counts: {
      accepted: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
    },
    errors: [
      {
        row: { type: Number, required: true },
        message: { type: String, required: true },
        raw: { type: String },
      },
    ],
    // Ephemeral staging store for preview -> confirm flow
    previewTransactions: [
      {
        date: { type: Date, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: 'INR' },
        direction: { type: String, enum: ['income', 'expense'], required: true },
        merchant: { type: String, default: 'unknown' },
        description: { type: String, required: true },
        category: { type: String, default: 'unknown' },
        categorySource: { type: String, default: 'unknown' },
        source: { type: String, default: 'csv' },
        fingerprint: { type: String, required: true },
        isDuplicate: { type: Boolean, default: false },
      },
    ],
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  },
);

export const ImportJob = mongoose.model<IImportJob>('ImportJob', importJobSchema);
