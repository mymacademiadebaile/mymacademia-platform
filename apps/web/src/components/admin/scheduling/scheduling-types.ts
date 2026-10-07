export type SessionStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "SUSPENDED" | "RESCHEDULED" | "CANCELLED";
export type SessionOrigin = "REGULAR" | "EXTRA" | "RESCHEDULED";
export type CoverageStatus = "PAID" | "PARTIAL" | "PENDING" | "OVERDUE" | "NONE" | "FREE";
export type AttendanceStatus = "EXPECTED" | "PRESENT" | "ABSENT";
export type ParticipantType = "ENROLLMENT" | "TRIAL" | "AUTHORIZED" | "MAKEUP";
export type CollectionMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";

export type CalendarSession = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  statusReason?: string;
  origin: SessionOrigin;
  substitute: boolean;
  manualOverride: boolean;
  seriesId: string | null;
  class: {
    id: string;
    name: string;
    capacity: number;
    billingMode: "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";
    disciplines: Array<{ id: string; name: string }>;
    levels: Array<{ id: string; name: string }>;
  };
  professors: Array<{ id: string; displayName: string; avatarUrl?: string }>;
  space: { id: string; name: string } | null;
  enrolledCount: number;
};

export type CalendarResponse = {
  from: string;
  to: string;
  today: string;
  items: CalendarSession[];
};

export type SessionParticipant = {
  studentId: string;
  student: { firstName: string; lastName: string; email?: string; phone?: string };
  participantType: ParticipantType;
  enrollmentId?: string;
  attendanceStatus: AttendanceStatus;
  billingType: "PER_CLASS" | "MONTHLY" | "FREE";
  payment: {
    status: CoverageStatus;
    paymentType: "PER_CLASS" | "MONTHLY" | null;
    chargeId?: string;
    paymentId?: string;
    amount: number;
    paidAmount: number;
    balanceAmount: number;
    paymentMethod?: string;
    receiptNumber?: string;
  };
};

export type SessionDetail = {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  statusReason?: string;
  statusHistory: Array<{ from: SessionStatus | null; to: SessionStatus; reason?: string; at: string }>;
  origin: SessionOrigin;
  spaceId: string | null;
  substitute: boolean;
  notes?: string;
  rosterFrozen: boolean;
  rescheduledFrom: { id: string; date: string; startTime: string; endTime: string; status: SessionStatus } | null;
  rescheduledTo: { id: string; date: string; startTime: string; endTime: string; status: SessionStatus } | null;
  professors?: Array<{ id: string; displayName: string }>;
  class: {
    id: string;
    name: string;
    capacity: number;
    billingMode: "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";
    pricePerClass: number;
    monthlyPrice: number;
    professors: Array<{ id: string; displayName: string }>;
  };
  participants: SessionParticipant[];
};

export type DanceSpace = {
  _id: string;
  branchId: string;
  name: string;
  description?: string;
  capacity?: number;
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  availabilityNotes?: string;
  sortOrder: number;
};

export type Holiday = { _id: string; date: string; name: string; branchId?: string };

export type ScheduleRule = {
  _id: string;
  seriesId: string;
  day: string;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo?: string;
  spaceId?: string;
  professorIds: string[];
  state: "UPCOMING" | "CURRENT" | "ENDED";
  endedReason?: string;
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: "Programada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Realizada",
  SUSPENDED: "Suspendida",
  RESCHEDULED: "Reprogramada",
  CANCELLED: "Cancelada"
};

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  PAID: "Pagado",
  PARTIAL: "Pago parcial",
  PENDING: "Pendiente",
  OVERDUE: "Vencido",
  NONE: "Sin cargo",
  FREE: "Sin costo"
};

export const PARTICIPANT_LABEL: Record<ParticipantType, string> = {
  ENROLLMENT: "Inscripto",
  TRIAL: "Prueba",
  AUTHORIZED: "Autorizado",
  MAKEUP: "Recupera"
};

export const METHOD_LABEL: Record<CollectionMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  OTHER: "Otro"
};

export const DAY_LABEL: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo"
};

export const WEEK_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

export function formatMoney(value: number) {
  return "$ " + value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** A random key per user action, so a double click never records the same collection twice. */
export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}
