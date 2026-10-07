import { Schema, Types, model, type ClientSession } from "mongoose";

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

/**
 * Next receipt number of the organization. Inside a transaction the increment is rolled back
 * with it, so an aborted collection does not leave a gap.
 */
export async function nextReceiptNumber(organizationId: Types.ObjectId | string, session?: ClientSession) {
  if (session) {
    // Upserting inside a transaction can race; make sure the counter exists first.
    await SequenceModel.updateOne(
      { organizationId, key: "PAYMENT_RECEIPT" },
      { $setOnInsert: { organizationId, key: "PAYMENT_RECEIPT", value: 0 } },
      { upsert: true }
    ).catch((error: { code?: number }) => {
      if (error?.code !== 11000) throw error;
    });
  }
  const sequence = await SequenceModel.findOneAndUpdate(
    { organizationId, key: "PAYMENT_RECEIPT" },
    { $inc: { value: 1 } },
    { upsert: !session, new: true, setDefaultsOnInsert: true, session }
  );
  if (!sequence) throw new Error("Receipt sequence not available");

  return `REC-${String(sequence.value).padStart(6, "0")}`;
}
