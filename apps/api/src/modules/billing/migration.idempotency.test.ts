import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startReplicaSet } from "../../test/mongo";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";
import { runSchedulingBillingMigration } from "./migration";
import { MigrationIssueModel } from "./migration-issue.model";
import { PaymentAllocationModel } from "./payment-allocation.model";
import { RefundModel } from "./refund.model";

/**
 * Idempotency of the billing part of the scheduling/billing migration. The database holds a
 * single organization, so every report counts only these payments.
 */

const NOW = new Date("2026-10-07T15:00:00.000Z");
let database: { stop: () => Promise<void> };
const ids = {} as { org: Types.ObjectId; branch: Types.ObjectId };
const paymentIds = {} as Record<string, Types.ObjectId>;

async function payment(key: string, overrides: Record<string, unknown> = {}) {
  const student = await StudentModel.create({ organizationId: ids.org, branchId: ids.branch, firstName: key, lastName: "Mig" });
  const created = await PaymentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    studentId: student._id,
    classId: new Types.ObjectId(),
    paymentType: "MONTHLY",
    concept: `Cuota ${key}`,
    period: "2026-10",
    amount: 250.75,
    dueDate: new Date("2026-10-10T12:00:00.000Z"),
    status: "PENDING",
    ...overrides
  });
  paymentIds[key] = created._id;
  return created;
}

async function snapshot() {
  return {
    charges: await ChargeModel.countDocuments(),
    collections: await CollectionModel.countDocuments(),
    allocations: await PaymentAllocationModel.countDocuments(),
    refunds: await RefundModel.countDocuments(),
    issues: await MigrationIssueModel.countDocuments()
  };
}

beforeAll(async () => {
  database = await startReplicaSet();
  const org = await OrganizationModel.create({ name: "Academia", slug: `migration-idem-${Date.now()}` });
  const branch = await BranchModel.create({ organizationId: org._id, name: "Sede" });
  Object.assign(ids, { org: org._id, branch: branch._id });

  await payment("pending");
  await payment("pending-overdue", { status: "OVERDUE", amount: 100 });
  await payment("paid", { status: "PAID", paidAt: new Date("2026-10-05T15:00:00.000Z"), paymentMethod: "CASH", receiptNumber: "MIG-1", amount: 300 });
  await payment("cancelled", { status: "CANCELLED", cancelledAt: new Date("2026-10-06T15:00:00.000Z"), cancellationReason: "Error" });
  await payment("paid-cancelled", {
    status: "CANCELLED",
    paidAt: new Date("2026-10-04T15:00:00.000Z"),
    cancelledAt: new Date("2026-10-06T15:00:00.000Z"),
    amount: 50
  });
  await payment("no-class", { classId: undefined });
}, 120_000);

afterAll(async () => {
  await database.stop();
});

describe("billing migration idempotency", () => {
  it("dry run reports the work without writing anything", async () => {
    const report = await runSchedulingBillingMigration({ apply: false, now: NOW });

    expect(report.mode).toBe("DRY_RUN");
    // Quirk of the dry run: unmirrored CANCELLED payments are reported as CREATED (the apply run
    // reports VOIDED / ISSUE for them), so the dry-run counters are only an approximation.
    expect(report.payments).toMatchObject({ scanned: 6, CREATED: 4, CREATED_WITH_COLLECTION: 1, ISSUE: 1 });
    expect(await snapshot()).toEqual({ charges: 0, collections: 0, allocations: 0, refunds: 0, issues: 0 });
    expect(report.validation.unmirroredPayments).toBe(6);
  });

  it("apply mirrors every payment, and its validation block reconciles the money", async () => {
    const report = await runSchedulingBillingMigration({ apply: true, now: NOW });

    expect(report.mode).toBe("APPLY");
    expect(report.payments).toMatchObject({ scanned: 6, CREATED: 2, CREATED_WITH_COLLECTION: 1, VOIDED: 1, ISSUE: 2, UNCHANGED: 0 });
    // Only the payment without class has no mirror charge.
    expect(report.validation.unmirroredPayments).toBe(1);
    expect(report.validation.legacyPaidCents).toBe(30000);
    expect(report.validation.mirroredCollectionCents).toBe(30000);
    // The payment without class (250.75, PENDING) counts as legacy debt but has no mirror yet.
    expect(report.validation.legacyOpenCents).toBe(25075 + 10000 + 25075);
    expect(report.validation.mirroredOpenCents).toBe(25075 + 10000);
    // LEGACY_PAYMENT_WITHOUT_CLASS + LEGACY_PAID_THEN_CANCELLED
    expect(report.validation.openIssues).toBe(2);
    expect(await MigrationIssueModel.countDocuments({ kind: "LEGACY_PAYMENT_WITHOUT_CLASS", entityId: paymentIds["no-class"] })).toBe(1);
    expect(await MigrationIssueModel.countDocuments({ kind: "LEGACY_PAID_THEN_CANCELLED", entityId: paymentIds["paid-cancelled"] })).toBe(1);
    expect((await CollectionModel.findOne({ legacyPaymentId: paymentIds.paid }).lean<any>())?.receiptNumber).toBe("MIG-1");
  });

  it("running apply again changes nothing: same counts, no new documents, ISSUE only for known issues", async () => {
    const before = await snapshot();

    const report = await runSchedulingBillingMigration({ apply: true, now: NOW });

    expect(await snapshot()).toEqual(before);
    expect(report.payments).toMatchObject({ scanned: 6, CREATED: 0, CREATED_WITH_COLLECTION: 0, MARKED_PAID: 0, VOIDED: 0, REFUNDED_AND_VOIDED: 0 });
    // Only the payment without class is re-reported as ISSUE. The paid-then-cancelled one was
    // mirrored as a VOID charge on the first run (its issue stays open), so it is now UNCHANGED.
    expect(report.payments.ISSUE).toBe(1);
    expect(report.payments.UNCHANGED).toBe(5);
    expect(report.validation.openIssues).toBe(2);
  });

  it("validation never leaves payments unmirrored except the one without class", async () => {
    const report = await runSchedulingBillingMigration({ apply: true, now: NOW });

    expect(report.validation.unmirroredPayments).toBe(1);
    const unmirrored = await PaymentModel.find({ _id: { $nin: (await ChargeModel.find().distinct("legacyPaymentId")) } }).lean();
    expect(unmirrored.map((item) => String(item._id))).toEqual([String(paymentIds["no-class"])]);
  });

  it("once the payment without class is fixed and reconciled, the validation block shows 0 unmirrored", async () => {
    await PaymentModel.updateOne({ _id: paymentIds["no-class"] }, { $set: { classId: new Types.ObjectId() } });

    const report = await runSchedulingBillingMigration({ apply: true, now: NOW });

    expect(report.payments.CREATED).toBe(1);
    expect(report.validation.unmirroredPayments).toBe(0);
    expect(report.validation.legacyOpenCents).toBe(report.validation.mirroredOpenCents);
    expect(report.validation.legacyPaidCents).toBe(report.validation.mirroredCollectionCents);

    const again = await runSchedulingBillingMigration({ apply: true, now: NOW });
    expect(again.payments.CREATED).toBe(0);
    expect(again.validation.unmirroredPayments).toBe(0);
  });

  // KNOWN ISSUE (see legacy-sync.test.ts): an identity collision (LEGACY_DUPLICATE_CHARGE) aborts the
  // transaction and withTransaction retries forever, so the migration would hang on such a payment.
  it.todo("migration records LEGACY_DUPLICATE_CHARGE and continues instead of looping (BUG: see legacy-sync.test.ts)");
});
