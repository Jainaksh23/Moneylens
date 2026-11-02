import mongoose, { Schema, Document } from 'mongoose';

export interface IUserPreferences {
  currency: string;
  dateFormat: string;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  preferences: IUserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

// Separate type for what we return to the client (never includes passwordHash)
export type UserResponse = Omit<IUser, 'passwordHash'>;

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Never returned in queries by default
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [1, 'Name must not be empty'],
      maxlength: [100, 'Name must be 100 characters or fewer'],
    },
    preferences: {
      currency: {
        type: String,
        default: 'INR',
        enum: ['INR'],
      },
      dateFormat: {
        type: String,
        default: 'DD/MM/YYYY',
        enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      // Strip passwordHash from all JSON serializations as safety net
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const User = mongoose.model<IUser>('User', userSchema);
