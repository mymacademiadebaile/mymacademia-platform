export type ChargeStatus = "PAID" | "PARTIAL" | "PENDING" | "OVERDUE" | "VOID";

export type ChargeView = {
  id: string;
  legacy: boolean;
  studentId: string;
  classId: string | null;
  enrollmentId: string | null;
  kind: "MONTHLY_FEE" | "CLASS_FEE" | "OTHER";
  period: string;
  sessionId: string | null;
  serviceDate: string | null;
  concept: string;
  dueDate: string;
  listAmount: number;
  amount: number;
  adjustments: number;
  owed: number;
  paid: number;
  balance: number;
  status: ChargeStatus;
  overdue: boolean;
  origin: string;
  joinPolicy: string | null;
  voidReason: string | null;
  legacyPaymentId: string | null;
  className?: string | null;
  student?: { id: string; firstName: string; lastName: string; isActive: boolean } | null;
};

export type CollectionView = {
  id: string;
  studentId: string;
  receivedAt: string;
  accountingDate: string;
  method: "CASH" | "TRANSFER" | "CARD" | "OTHER";
  amount: number;
  allocated: number;
  refunded: number;
  credit: number;
  receiptNumber: string | null;
  notes: string | null;
  hasProof: boolean;
  legacyPaymentId: string | null;
  student?: { firstName: string; lastName: string } | null;
};

export type StudentAccount = {
  student: { id: string; firstName: string; lastName: string; isActive: boolean };
  balance: { pending: number; overdue: number; partialCount: number; openCount: number; credit: number };
  charges: ChargeView[];
  collections: CollectionView[];
  refunds: Array<{ id: string; collectionId: string; amount: number; accountingDate: string; method: string; reason: string }>;
  adjustments: Array<{ id: string; chargeId: string; type: string; amount: number; reason: string; accountingDate: string }>;
};

export const CHARGE_STATUS_LABEL: Record<ChargeStatus, string> = {
  PAID: "Pagado",
  PARTIAL: "Pago parcial",
  PENDING: "Pendiente",
  OVERDUE: "Vencido",
  VOID: "Anulado"
};

export const CHARGE_KIND_LABEL: Record<ChargeView["kind"], string> = {
  MONTHLY_FEE: "Mensualidad",
  CLASS_FEE: "Clase",
  OTHER: "Otro"
};

export const ADJUSTMENT_LABEL: Record<string, string> = {
  DISCOUNT: "Descuento",
  SURCHARGE: "Recargo",
  CREDIT_TRANSFER: "Crédito por pagos previos",
  WRITE_OFF: "Condonación"
};
