import { Schema, Types, model } from "mongoose";

export interface PasswordResetToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
}

const passwordResetTokenSchema = new Schema<PasswordResetToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetTokenModel = model<PasswordResetToken>(
  "PasswordResetToken",
  passwordResetTokenSchema
);
