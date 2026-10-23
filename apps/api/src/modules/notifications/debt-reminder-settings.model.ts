import { Schema, Types, model } from "mongoose";
export const DEFAULT_REMINDER_POLICY = { enabled: false, automaticEnabled: false, minimumDaysBetween: 7, daysOverdue: 7, includeBreakdown: true };
export interface DebtReminderSettings {
  organizationId: Types.ObjectId;
  enabled: boolean;
  automaticEnabled: boolean;
  minimumDaysBetween: number;
  daysOverdue: number;
  includeBreakdown: boolean;
  updatedByUserId: Types.ObjectId;
}
const schema = new Schema<DebtReminderSettings>({
  organizationId: { type: Schema.Types.ObjectId, required: true, unique: true },
  enabled: { type: Boolean, default: false }, automaticEnabled: { type: Boolean, default: false },
  minimumDaysBetween: { type: Number, min: 1, max: 60, default: 7 }, daysOverdue: { type: Number, min: 1, max: 90, default: 7 },
  includeBreakdown: { type: Boolean, default: true }, updatedByUserId: { type: Schema.Types.ObjectId, required: true }
}, { timestamps: true });
export const DebtReminderSettingsModel = model<DebtReminderSettings>("DebtReminderSettings", schema);
export async function debtReminderPolicy(organizationId: string) {
  return await DebtReminderSettingsModel.findOne({ organizationId }).lean() ?? DEFAULT_REMINDER_POLICY;
}
