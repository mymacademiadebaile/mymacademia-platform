import { Schema, Types, model } from "mongoose";

interface Sequence {
  organizationId: Types.ObjectId;
  key: string;
  value: number;
}

const sequenceSchema = new Schema<Sequence>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    key: { type: String, required: true, trim: true },
    value: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

sequenceSchema.index({ organizationId: 1, key: 1 }, { unique: true });

export const SequenceModel = model<Sequence>("Sequence", sequenceSchema);

export async function nextReceiptNumber(organizationId: Types.ObjectId | string) {
  const sequence = await SequenceModel.findOneAndUpdate(
    { organizationId, key: "PAYMENT_RECEIPT" },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return `REC-${String(sequence.value).padStart(6, "0")}`;
}
