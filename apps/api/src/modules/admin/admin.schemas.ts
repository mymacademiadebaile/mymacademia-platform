import { z } from "zod";
import { CALENDAR_DATE_PATTERN, isCalendarDate, toDateOnly, toReceivedAt } from "../../common/dates";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const optionalBooleanQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

export const pageQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const dateOrInstantSchema = z.union([z.string().trim().min(1), z.date()]).refine(
  (value) => {
    if (typeof value === "string" && isCalendarDate(value)) return true;
    if (typeof value === "string" && CALENDAR_DATE_PATTERN.test(value)) return false;
    return !Number.isNaN(new Date(value).getTime());
  },
  { message: "La fecha no es válida" }
);

/** A calendar day ("YYYY-MM-DD" or an ISO instant) stored with the date-only convention. */
export const dateOnlyInputSchema = dateOrInstantSchema.transform((value) => toDateOnly(value));

/** When money was received; a bare day keeps today's time or noon of that day in Argentina. */
export const receivedAtInputSchema = dateOrInstantSchema.transform((value) => toReceivedAt(value));

export const calendarDateSchema = z.string().refine(isCalendarDate, { message: "La fecha no es válida" });
