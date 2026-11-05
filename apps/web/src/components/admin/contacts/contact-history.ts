import type { ContactDetailResponse } from "@mym/shared";
import { argentinaDateOf } from "@/lib/dates";

/**
 * Calendar day (YYYY-MM-DD) of a history entry. Session dates are already plain days; instants
 * (trial "scheduledFor", "recordedAt") must be read in Argentina, otherwise a 21:00 class shows the next day.
 */
function academyDay(value?: string | null) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : argentinaDateOf(value);
}

const trialStatus = { SCHEDULED: "Reservada", COMPLETED: "Presente", CANCELLED: "Cancelada", CONVERTED: "Convertida" };

export function contactClassHistory(data: ContactDetailResponse) {
  return [
    ...data.trials.map((trial) => ({ id: `trial-${trial._id}`, date: academyDay(trial.scheduledFor),
      name: trial.classId?.name ?? "Clase histórica", type: trial.kind === "COURTESY" ? "Cortesía sin cargo" : "Prueba gratuita",
      status: trialStatus[trial.status], trialId: trial._id, scheduled: trial.status === "SCHEDULED" })),
    ...data.attendance.filter((item) => !item.trialId).map((item) => ({ id: `attendance-${item._id}`,
      date: academyDay(item.sessionId?.sessionDate ?? item.recordedAt), name: item.sessionId?.classId?.name ?? "Clase histórica",
      type: item.participantType === "COURTESY" || item.participantType === "TRIAL" || item.sessionId?.classId?.billingMode === "FREE"
        ? "Clase sin cargo" : "Clase arancelada", status: "Presente", trialId: undefined, scheduled: false }))
  ].sort((a, b) => b.date.localeCompare(a.date));
}
