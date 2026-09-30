export type NamedItem = { id: string; name: string };

export type PaymentStatus = "PAID" | "PENDING" | "OVERDUE" | "FREE";
export type AttendanceStatus = "EXPECTED" | "PRESENT" | "ABSENT";
export type BillingType = "PER_CLASS" | "MONTHLY" | "FREE";
export type BillingMode = "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";
export type SessionPhase = "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";

export type Occurrence = { date: string; startTime: string; endTime: string };

export type ClassSummary = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  disciplines: NamedItem[];
  segments: NamedItem[];
  levels: NamedItem[];
  branch: { id: string; name: string };
  schedules: Array<{ day: string; startTime: string; endTime: string }>;
  capacity: number;
  enrolledCount: number;
  billingMode: BillingMode;
  pricePerClass: number;
  monthlyPrice: number;
  freeTrialEnabled: boolean;
  nextOccurrence: Occurrence | null;
};

export type SessionSummaryCounts = {
  enrolled: number;
  paid: number;
  pending: number;
  overdue: number;
  free: number;
  present: number;
  absent: number;
  expected: number;
};

/** Session as returned by dashboard, calendar and class detail. */
export type SessionItem = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  persistedStatus: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  phase: SessionPhase;
  class: {
    id: string;
    name: string;
    disciplines: NamedItem[];
    segments: NamedItem[];
    levels: NamedItem[];
    branch: { id: string; name: string };
    capacity: number;
    billingMode: BillingMode;
    pricePerClass: number;
    monthlyPrice: number;
  };
  enrolledCount: number;
  summary?: SessionSummaryCounts;
};

export type PaymentReference = { kind: "CLASS" | "MONTH"; value: string } | null;

export type RosterItem = {
  studentId: string;
  student: { firstName: string; lastName: string; email?: string; phone?: string };
  participantType: "ENROLLMENT" | "TRIAL";
  billingType: BillingType;
  attendanceStatus: AttendanceStatus;
  payment: { status: PaymentStatus; amount: number; reference: PaymentReference };
};

export type SessionDetail = SessionItem & {
  professor: { displayName: string };
  summary: {
    students: number;
    paid: number;
    pending: number;
    free: number;
    present: number;
    absent: number;
  };
  roster: RosterItem[];
};

export type StudentEnrollment = {
  enrollmentId: string;
  classId: string;
  className: string;
  disciplines: string[];
  segments: string[];
  levels: string[];
  billingType: BillingType;
  paymentStatus: PaymentStatus;
  amount: number;
  reference: PaymentReference;
  enrolledAt: string;
};

export type LastAttendance = {
  status: "PRESENT" | "ABSENT";
  date: string;
  className: string;
} | null;

export type StudentOverview = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  enrollments: StudentEnrollment[];
  financialStatus: PaymentStatus;
  lastAttendance: LastAttendance;
};

export type DashboardData = {
  today: string;
  now: string;
  professor: {
    id: string;
    displayName: string;
    firstName: string;
    avatarUrl: string;
    specialties: NamedItem[];
  };
  nextSession: SessionItem | null;
  todaySessions: SessionItem[];
  stats: {
    activeClasses: number;
    classesToday: number;
    classesThisWeek: number;
    activeStudents: number;
    pendingPayments: number;
  };
  alerts: Array<{
    id: string;
    type: string;
    tone: "warning" | "danger" | "info";
    message: string;
    count: number;
    href: string;
  }>;
};

export type CalendarData = { from: string; to: string; today: string; items: SessionItem[] };

export type ClassesData = { items: ClassSummary[] };

export type ClassDetailData = {
  class: ClassSummary;
  upcoming: SessionItem[];
  history: SessionItem[];
  students: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    enrollment: StudentEnrollment;
    lastAttendance: LastAttendance;
  }>;
};

export type StudentsData = {
  classes: Array<{ id: string; name: string }>;
  items: StudentOverview[];
};

export type StudentDetailData = {
  student: { id: string; firstName: string; lastName: string; email: string; phone: string; isActive: boolean };
  enrollments: StudentEnrollment[];
  financialStatus: PaymentStatus;
  payments: Array<{
    id: string;
    classId: string;
    className: string;
    type: "PER_CLASS" | "MONTHLY";
    date: string;
    period: string;
    concept: string;
    amount: number;
    status: PaymentStatus;
  }>;
  attendance: {
    totals: { classes: number; present: number; absent: number };
    recent: Array<{ date: string; startTime: string; className: string; status: "PRESENT" | "ABSENT" }>;
  };
  enrolledSince?: string;
};

export type ProfileData = {
  user: { id: string; firstName: string; lastName: string; email: string; phone: string };
  professor: {
    id: string;
    displayName: string;
    phone: string;
    bio: string;
    instagram: string;
    avatarUrl: string;
    introVideoUrl: string;
    specialties: NamedItem[];
  };
  branches: Array<{ id: string; name: string; address: string; isActive: boolean }>;
};
