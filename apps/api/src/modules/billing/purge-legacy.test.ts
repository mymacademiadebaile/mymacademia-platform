import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startReplicaSet } from "../../test/mongo";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";
import { syncLegacyPayment } from "./legacy-sync";
import { MigrationIssueModel } from "./migration-issue.model";
import { PaymentAllocationModel } from "./payment-allocation.model";
import { purgeLegacyPayments } from "./purge-legacy";
import { RefundModel } from "./refund.model";

let database: { stop: () => Promise<void> };
const ids = {} as { org: Types.ObjectId; branch: Types.ObjectId; student: Types.ObjectId };
let counter = 0;

async function legacyPayment(paid: boolean) {
  const n = ++counter;
  return PaymentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    studentId: ids.student,
    classId: new Types.ObjectId(),
    paymentType: "MONTHLY",
    concept: "Cuota",
    period: "2026-10",
    amount: 100,
    dueDate: new Date("2026-10-10T12:00:00.000Z"),
    status: paid ? "PAID" : "PENDING",
    ...(paid ? { paidAt: new Date("2026-10-05T15:00:00.000Z"), paymentMethod: "CASH", receiptNumber: `P-${n}` } : {})
  });
}

/** A charge/collection/allocation that never came from a legacy payment. */
async function nativeBilling() {
  const charge = await ChargeModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    studentId: ids.student,
    kind: "OTHER",
    period: "2026-10",
    concept: "Nativo",
    listCents: 5000,
    amountCents: 5000,
    paidCents: 5000,
    balanceCents: 0,
    dueDate: "2026-10-10",
    status: "PAID"
  });
  const collection = await CollectionModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    studentId: ids.student,
    receivedAt: new Date("2026-10-05T15:00:00.000Z"),
    accountingDate: "2026-10-05",
    method: "CASH",
    amountCents: 5000,
    allocatedCents: 5000
  });
  await PaymentAllocationModel.create({
    organizationId: ids.org,
    studentId: ids.student,
    collectionId: collection._id,
    chargeId: charge._id,
    amountCents: 5000,
    accountingDate: "2026-10-05"
  });
}

async function counts() {
  return {
    payments: await PaymentModel.countDocuments(),
    issues: await MigrationIssueModel.countDocuments({ entityType: "Payment" }),
    charges: await ChargeModel.countDocuments(),
    collections: await CollectionModel.countDocuments(),
    allocations: await PaymentAllocationModel.countDocuments(),
    refunds: await RefundModel.countDocuments()
  };
}

beforeAll(async () => {
  database = await startReplicaSet();
  const org = await OrganizationModel.create({ name: "Academia", slug: `purge-legacy-${Date.now()}` });
  const branch = await BranchModel.create({ organizationId: org._id, name: "Sede" });
  const student = await StudentModel.create({ organizationId: org._id, branchId: branch._id, firstName: "Purga", lastName: "Test" });
  Object.assign(ids, { org: org._id, branch: branch._id, student: student._id });
}, 120_000);

afterAll(async () => {
  await database.stop();
});

beforeEach(async () => {
  await Promise.all([
    PaymentModel.deleteMany({}),
    MigrationIssueModel.deleteMany({}),
    ChargeModel.deleteMany({}),
    CollectionModel.deleteMany({}),
    PaymentAllocationModel.deleteMany({}),
    RefundModel.deleteMany({})
  ]);
  const pending = await legacyPayment(false);
  const paid = await legacyPayment(true);
  await syncLegacyPayment(pending._id);
  await syncLegacyPayment(paid._id);
  await MigrationIssueModel.create({
    organizationId: ids.org,
    kind: "LEGACY_TEST",
    entityType: "Payment",
    entityId: paid._id,
    message: "issue"
  });
  await MigrationIssueModel.create({
    organizationId: ids.org,
    kind: "OTHER_TEST",
    entityType: "Enrollment",
    entityId: new Types.ObjectId(),
    message: "unrelated"
  });
  await nativeBilling();
});

describe("purgeLegacyPayments", () => {
  it("dry-run (default) counts and deletes nothing", async () => {
    const before = await counts();
    expect(before).toMatchObject({ payments: 2, issues: 1, charges: 3, collections: 2, allocations: 2 });

    const report = await purgeLegacyPayments();
    const withMirrors = await purgeLegacyPayments({ includeMirrors: true });

    expect(report).toMatchObject({ mode: "DRY_RUN", includeMirrors: false });
    expect(report.counts).toMatchObject({ payments: 2, migrationIssues: 1, charges: 0, collections: 0, paymentAllocations: 0, refunds: 0 });
    expect(withMirrors.counts).toMatchObject({ payments: 2, migrationIssues: 1, charges: 2, collections: 1, paymentAllocations: 1, refunds: 0 });
    expect(await counts()).toEqual(before);
  });

  it("apply deletes Payment and its issues but leaves charges, collections and unrelated issues", async () => {
    const report = await purgeLegacyPayments({ apply: true });

    expect(report).toMatchObject({ mode: "APPLY" });
    expect(report.counts.payments).toBe(2);
    expect(await counts()).toEqual({ payments: 0, issues: 0, charges: 3, collections: 2, allocations: 2, refunds: 0 });
    expect(await MigrationIssueModel.countDocuments({ entityType: "Enrollment" })).toBe(1);
    expect(await ChargeModel.countDocuments({ legacyPaymentId: { $exists: true } })).toBe(2);
  });

  it("includeMirrors also deletes only the mirrored documents, keeping native billing", async () => {
    const native = await ChargeModel.findOne({ legacyPaymentId: { $exists: false } }).lean<any>();

    const report = await purgeLegacyPayments({ apply: true, includeMirrors: true });

    expect(report.counts).toMatchObject({ payments: 2, migrationIssues: 1, charges: 2, collections: 1, paymentAllocations: 1, refunds: 0 });
    expect(await counts()).toEqual({ payments: 0, issues: 0, charges: 1, collections: 1, allocations: 1, refunds: 0 });
    const remaining = await ChargeModel.find().lean<any[]>();
    expect(remaining.map((item) => String(item._id))).toEqual([String(native._id)]);
    const allocation = await PaymentAllocationModel.findOne().lean<any>();
    expect(String(allocation.chargeId)).toBe(String(native._id));
  });

  it("is repeatable: a second apply finds nothing", async () => {
    await purgeLegacyPayments({ apply: true, includeMirrors: true });
    const again = await purgeLegacyPayments({ apply: true, includeMirrors: true });
    expect(again.counts).toEqual({ payments: 0, migrationIssues: 0, charges: 0, collections: 0, paymentAllocations: 0, refunds: 0 });
  });
});
