import { Types, type ClientSession } from "mongoose";
import { academyNow } from "../../common/dates";
import { overduePaymentFilter } from "../payments/payment-status";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";
import { legacyPaymentToChargeView, unmirroredLegacyPayments, type ChargeView } from "./legacy-adapter";

/**
 * Single source of truth for "how much does a student owe". Admin screens, the professor
 * portal, communications and reports all call these functions.
 *
 * - pending: everything still owed (due or not);
 * - overdue: owed and its due day already ended in Argentina;
 * - partial: charges with some money applied and a remaining balance;
 * - credit: money received and not applied to any charge (nor returned).
 */

export type ChargeDisplayStatus = "PAID" | "PARTIAL" | "PENDING" | "OVERDUE" | "VOID";

export interface ChargeState {
  owedCents: number;
  paidCents: number;
  balanceCents: number;
  status: ChargeDisplayStatus;
  overdue: boolean;
}

/** Display state of a charge on a given day. Pure: same input, same answer. */
export function chargeState(
  charge: Pick<ChargeView, "amountCents" | "adjustmentsCents" | "paidCents" | "dueDate" | "status">,
  today = academyNow().date
): ChargeState {
  const owedCents = charge.amountCents + (charge.adjustmentsCents ?? 0);
  const paidCents = charge.paidCents ?? 0;
  const balanceCents = Math.max(0, owedCents - paidCents);
  if (charge.status === "VOID") return { owedCents, paidCents, balanceCents: 0, status: "VOID", overdue: false };
  if (balanceCents === 0) return { owedCents, paidCents, balanceCents, status: "PAID", overdue: false };
  const overdue = charge.dueDate < today;
  const status: ChargeDisplayStatus = overdue ? "OVERDUE" : paidCents > 0 ? "PARTIAL" : "PENDING";
  return { owedCents, paidCents, balanceCents, status, overdue };
}

export interface StudentBalance {
  studentId: string;
  pendingCents: number;
  overdueCents: number;
  partialCount: number;
  openCount: number;
  creditCents: number;
}

function emptyBalance(studentId: string): StudentBalance {
  return { studentId, pendingCents: 0, overdueCents: 0, partialCount: 0, openCount: 0, creditCents: 0 };
}

/** Open (not void, not fully paid) charges, legacy payments without mirror included. */
export async function openCharges(
  organizationId: string,
  filter: { studentIds?: Array<string | Types.ObjectId>; classIds?: Array<string | Types.ObjectId> } = {},
  session?: ClientSession
): Promise<ChargeView[]> {
  const scope: Record<string, unknown> = { organizationId };
  if (filter.studentIds) scope.studentId = { $in: filter.studentIds.map((id) => new Types.ObjectId(String(id))) };
  if (filter.classIds) scope.classId = { $in: filter.classIds.map((id) => new Types.ObjectId(String(id))) };

  const [charges, legacy] = await Promise.all([
    ChargeModel.find({ ...scope, status: "OPEN" }).session(session ?? null).lean<ChargeView[]>(),
    unmirroredLegacyPayments({ ...scope, status: { $in: ["PENDING", "OVERDUE"] } }, session)
  ]);
  return [...charges, ...legacy.map(legacyPaymentToChargeView)];
}

/** Balances of the given students (or of every student with activity when omitted). */
export async function studentBalances(
  organizationId: string,
  studentIds?: Array<string | Types.ObjectId>,
  today = academyNow().date
): Promise<Map<string, StudentBalance>> {
  const balances = new Map<string, StudentBalance>();
  const get = (id: string) => {
    const existing = balances.get(id);
    if (existing) return existing;
    const created = emptyBalance(id);
    balances.set(id, created);
    return created;
  };
  for (const id of studentIds ?? []) get(String(id));

  const charges = await openCharges(organizationId, { studentIds });
  for (const charge of charges) {
    const state = chargeState(charge, today);
    if (state.status === "PAID" || state.status === "VOID") continue;
    const balance = get(String(charge.studentId));
    balance.pendingCents += state.balanceCents;
    balance.openCount += 1;
    if (state.overdue) balance.overdueCents += state.balanceCents;
    if (state.paidCents > 0) balance.partialCount += 1;
  }

  const collectionScope: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
  if (studentIds) collectionScope.studentId = { $in: studentIds.map((id) => new Types.ObjectId(String(id))) };
  const credit = await CollectionModel.aggregate<{ _id: Types.ObjectId; credit: number }>([
    { $match: collectionScope },
    { $project: { studentId: 1, credit: { $subtract: ["$amountCents", { $add: ["$allocatedCents", "$refundedCents"] }] } } },
    { $match: { credit: { $gt: 0 } } },
    { $group: { _id: "$studentId", credit: { $sum: "$credit" } } }
  ]);
  for (const row of credit) get(String(row._id)).creditCents += row.credit;

  return balances;
}

/** Students with at least one overdue obligation. Single definition of "debtor". */
export async function studentIdsWithOverdueDebt(organizationId: string, now = new Date()) {
  const today = academyNow(now).date;
  const [fromCharges, legacy] = await Promise.all([
    ChargeModel.distinct("studentId", { organizationId, status: "OPEN", dueDate: { $lt: today }, balanceCents: { $gt: 0 } }),
    unmirroredLegacyPayments({ organizationId, ...overduePaymentFilter(now) })
  ]);
  const ids = new Map<string, Types.ObjectId>();
  for (const id of fromCharges as Types.ObjectId[]) ids.set(String(id), id);
  for (const payment of legacy) ids.set(String(payment.studentId), payment.studentId);
  return [...ids.values()];
}

/** Total overdue amount and number of overdue charges of the organization (attention badge). */
export async function overdueSummary(organizationId: string, now = new Date()) {
  const today = academyNow(now).date;
  const charges = await openCharges(organizationId);
  let overdueCents = 0;
  let overdueCount = 0;
  for (const charge of charges) {
    const state = chargeState(charge, today);
    if (!state.overdue) continue;
    overdueCents += state.balanceCents;
    overdueCount += 1;
  }
  return { overdueCents, overdueCount };
}
