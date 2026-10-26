import type { ContactDetailResponse } from "@mym/shared";

const trialStatus = { SCHEDULED: "Reservada", COMPLETED: "Presente", CANCELLED: "Cancelada", CONVERTED: "Convertida" };

export function contactClassHistory(data: ContactDetailResponse) {
  return [
    ...data.trials.map((trial) => ({ id: `trial-${trial._id}`, date: trial.scheduledFor,
      name: trial.classId?.name ?? "Clase histórica", type: trial.kind === "COURTESY" ? "Cortesía sin cargo" : "Prueba gratuita",
      status: trialStatus[trial.status], trialId: trial._id, scheduled: trial.status === "SCHEDULED" })),
    ...data.attendance.filter((item) => !item.trialId).map((item) => ({ id: `attendance-${item._id}`,
      date: item.sessionId?.sessionDate ?? item.recordedAt ?? "", name: item.sessionId?.classId?.name ?? "Clase histórica",
      type: item.participantType === "COURTESY" || item.participantType === "TRIAL" || item.sessionId?.classId?.billingMode === "FREE"
        ? "Clase sin cargo" : "Clase arancelada", status: "Presente", trialId: undefined, scheduled: false }))
  ].sort((a, b) => b.date.localeCompare(a.date));
}
