import type { SessionStatus } from "@mym/shared";
import { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";

/**
 * Allowed session transitions. COMPLETED, RESCHEDULED and CANCELLED are final for regular
 * operation; reopening a completed session is a separate, audited action that needs a reason.
 */
export const SESSION_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "COMPLETED", "SUSPENDED", "CANCELLED", "RESCHEDULED"],
  IN_PROGRESS: ["COMPLETED", "SUSPENDED", "CANCELLED"],
  SUSPENDED: ["SCHEDULED", "RESCHEDULED", "CANCELLED"],
  COMPLETED: [],
  RESCHEDULED: [],
  CANCELLED: []
};

/** Transitions that need a human reason in the history. */
const REASON_REQUIRED: SessionStatus[] = ["SUSPENDED", "CANCELLED", "RESCHEDULED"];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  SCHEDULED: "programada",
  IN_PROGRESS: "en curso",
  COMPLETED: "realizada",
  SUSPENDED: "suspendida",
  RESCHEDULED: "reprogramada",
  CANCELLED: "cancelada"
};

export function canTransition(from: SessionStatus, to: SessionStatus) {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: SessionStatus, to: SessionStatus, reason?: string) {
  if (from === to) {
    throw new AppError(409, `La clase ya está ${SESSION_STATUS_LABELS[to]}`, "SESSION_STATUS_UNCHANGED");
  }
  if (!canTransition(from, to)) {
    throw new AppError(
      409,
      `Una clase ${SESSION_STATUS_LABELS[from]} no puede pasar a ${SESSION_STATUS_LABELS[to]}`,
      "INVALID_SESSION_TRANSITION"
    );
  }
  if (REASON_REQUIRED.includes(to) && !reason?.trim()) {
    throw new AppError(422, "Indicá el motivo del cambio", "SESSION_REASON_REQUIRED");
  }
}

/** History entry appended on every status change. */
export function statusChange(from: SessionStatus | null, to: SessionStatus, reason: string | undefined, userId?: string) {
  return {
    from,
    to,
    reason: reason?.trim() || undefined,
    userId: userId ? new Types.ObjectId(userId) : undefined,
    at: new Date()
  };
}
