import mongoose, { Schema, Document } from 'mongoose';

export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export type GoalPriority = 'high' | 'medium' | 'low';

export interface IGoal extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  priority: GoalPriority;
  status: GoalStatus;
  monthlyContribution?: number | null;
  expectedReturnRate?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const goalSchema = new Schema<IGoal>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Goal name is required'],
      trim: true,
      minlength: [1, 'Goal name must not be empty'],
      maxlength: [200, 'Goal name must be 200 characters or fewer'],
    },
    targetAmount: {
      type: Number,
      required: [true, 'Target amount is required'],
      min: [0.01, 'Target amount must be greater than 0'],
    },
    currentAmount: {
      type: Number,
      default: 0,
      min: [0, 'Current amount cannot be negative'],
    },
    targetDate: {
      type: Date,
      required: [true, 'Target date is required'],
      validate: {
        validator: function (this: IGoal, value: Date) {
          return value > new Date();
        },
        message: 'Target date must be in the future',
      },
    },
    priority: {
      type: String,
      enum: {
        values: ['high', 'medium', 'low'],
        message: '{VALUE} is not a valid priority (must be high, medium, or low)',
      },
      default: 'medium',
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'completed', 'paused', 'cancelled'],
        message: '{VALUE} is not a valid status',
      },
      default: 'active',
    },
    monthlyContribution: {
      type: Number,
      min: [0, 'Monthly contribution cannot be negative'],
      default: null,
    },
    expectedReturnRate: {
      type: Number,
      min: [0, 'Expected return rate cannot be negative'],
      max: [100, 'Expected return rate cannot exceed 100%'],
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

// Compound indexes for efficient querying
goalSchema.index({ userId: 1, status: 1 });
goalSchema.index({ userId: 1, targetDate: 1 });

export const Goal = mongoose.model<IGoal>('Goal', goalSchema);
