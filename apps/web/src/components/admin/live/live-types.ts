export type Branch = {
  _id: string;
  name: string;
  address?: string;
  isActive: boolean;
};

export type CatalogItem = {
  _id: string;
  type: "DISCIPLINE" | "SEGMENT" | "LEVEL";
  name: string;
  isActive: boolean;
  sortOrder: number;
  usage?: {
    classes: number;
    professors: number;
    total: number;
  };
};

export type Professor = {
  _id: string;
  displayName: string;
  phone?: string;
  bio?: string;
  instagram?: string;
  avatarUrl?: string;
  introVideoUrl?: string;
  disciplineIds: Array<CatalogItem | string>;
  isActive: boolean;
  userId?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    branchIds: string[];
    role: string;
    isActive: boolean;
  };
};

export type Student = {
  _id: string;
  branchId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  guardianName?: string;
  guardianPhone?: string;
  notes?: string;
  isActive: boolean;
};

export type DanceClass = {
  _id: string;
  branchId: string;
  name: string;
  professorIds: Array<Professor | string>;
  disciplineIds: Array<CatalogItem | string>;
  segmentIds: Array<CatalogItem | string>;
  levelIds: Array<CatalogItem | string>;
  capacity: number;
  activeEnrollmentCount?: number;
  schedules: Array<{
    day: string;
    startTime: string;
    endTime: string;
  }>;
  status: "ACTIVE" | "INACTIVE";
};

export type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "OTHER";

export type Payment = {
  _id: string;
  branchId: string;
  studentId: Student | string;
  concept: string;
  period: string;
  amount: number;
  dueDate: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  effectiveStatus?: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  receiptNumber?: string;
  proofUrl?: string;
  notes?: string;
  cancellationReason?: string;
};

export type Summary = {
  activeStudents: number;
  activeProfessors: number;
  activeClasses: number;
  activeEnrollments: number;
  pendingPayments: number;
  overduePayments: number;
  collectedAmount: number;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};
