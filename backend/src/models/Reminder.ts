import mongoose, { Schema, Document } from 'mongoose';

export type ReminderSource = 'detected' | 'manual';
export type ReminderStatus = 'active' | 'dismissed' | 'confirmed';

export interface IReminder extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  amount: number;
  dueDay: number; // Day of month 1-31
  category?: string;
  source: ReminderSource;
  status: ReminderStatus;
  lastPaidDate?: Date | null;
  nextDueDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const reminderSchema = new Schema<IReminder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Reminder title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    dueDay: {
      type: Number,
      required: [true, 'Due day is required'],
      min: [1, 'Due day must be between 1 and 31'],
      max: [31, 'Due day must be between 1 and 31'],
    },
    category: {
      type: String,
      trim: true,
      default: 'Bills & Utilities',
    },
    source: {
      type: String,
      enum: {
        values: ['detected', 'manual'],
        message: '{VALUE} is not a valid reminder source',
      },
      default: 'manual',
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'dismissed', 'confirmed'],
        message: '{VALUE} is not a valid reminder status',
      },
      default: 'active',
      index: true,
    },
    lastPaidDate: {
      type: Date,
      default: null,
    },
    nextDueDate: {
      type: Date,
      default: null,
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

reminderSchema.index({ userId: 1, status: 1, dueDay: 1 });

export const Reminder = mongoose.model<IReminder>('Reminder', reminderSchema);
