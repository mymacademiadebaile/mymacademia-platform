import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startReplicaSet } from "../../test/mongo";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";
import { registerCollection } from "./collection-service";
import { ChargeModel, monthlyChargeKey } from "./charge.model";
import { CollectionModel } from "./collection.model";
import { mirrorLegacyPayment, syncLegacyPayment } from "./legacy-sync";
import { MigrationIssueModel } from "./migration-issue.model";
import { PaymentAllocationModel } from "./payment-allocation.model";
import { RefundModel } from "./refund.model";

/** Behaviour of the legacy Payment -> Charge/Collection/Allocation/Refund mirror (documents CURRENT behaviour). */

let database: { stop: () => Promise<void> };
const ids = {} as { org: Types.ObjectId; branch: Types.ObjectId; admin: Types.ObjectId };
let counter = 0;

async function student() {
  return StudentModel.create({ organizationId: ids.org, branchId: ids.branch, firstName: `Alumno${++counter}`, lastName: "Sync" });
}

async function payment(overrides: Record<string, unknown> = {}) {
  const alumno = (overrides.studentId as Types.ObjectId | undefined) ?? (await student())._id;
  return PaymentModel.create({
    organizationId: ids.org,
    branchId: ids.branch,
    studentId: alumno,
    classId: new Types.ObjectId(),
    paymentType: "MONTHLY",
    concept: "Cuota octubre",
    period: "2026-10",
    amount: 300.5,
    dueDate: new Date("2026-10-10T12:00:00.000Z"),
    status: "PENDING",
    ...overrides
  });
}

const paidFields = () => ({
  status: "PAID",
  paidAt: new Date("2026-10-05T15:00:00.000Z"),
  paymentMethod: "TRANSFER",
  receiptNumber: `R-${++counter}-${Date.now()}`
});

beforeAll(async () => {
  database = await startReplicaSet();
  const org = await OrganizationModel.create({ name: "Academia", slug: `legacy-sync-${Date.now()}` });
  const branch = await BranchModel.create({ organizationId: org._id, name: "Sede" });
  Object.assign(ids, { org: org._id, branch: branch._id, admin: new Types.ObjectId() });
}, 120_000);

afterAll(async () => {
  await database.stop();
});

describe("syncLegacyPayment: PENDING", () => {
  it("creates an OPEN mirror charge in cents with the legacy link and MIGRATED origin", async () => {
    const pending = await payment();

    expect(await syncLegacyPayment(pending._id)).toBe("CREATED");

    const charge = await ChargeModel.findOne({ legacyPaymentId: pending._id }).lean<any>();
    expect(charge).toMatchObject({
      status: "OPEN",
      kind: "MONTHLY_FEE",
      origin: "MIGRATED",
      amountCents: 30050,
      listCents: 30050,
      paidCents: 0,
      balanceCents: 30050,
      dueDate: "2026-10-10",
      chargeKey: monthlyChargeKey(pending.studentId, pending.classId, "2026-10")
    });
    expect(await CollectionModel.countDocuments({ legacyPaymentId: pending._id })).toBe(0);
  });

  it("is idempotent: a second run does not duplicate the charge", async () => {
    const pending = await payment();

    expect(await syncLegacyPayment(pending._id)).toBe("CREATED");
    expect(await syncLegacyPayment(pending._id)).toBe("UNCHANGED");
    expect(await syncLegacyPayment(pending._id, { mode: "migration" })).toBe("UNCHANGED");

    expect(await ChargeModel.countDocuments({ legacyPaymentId: pending._id })).toBe(1);
  });

  it("returns UNCHANGED for an unknown payment id", async () => {
    expect(await syncLegacyPayment(new Types.ObjectId())).toBe("UNCHANGED");
  });

  it("dry run reports the outcome without writing", async () => {
    const pending = await payment();

    expect(await syncLegacyPayment(pending._id, { dryRun: true })).toBe("CREATED");
    expect(await ChargeModel.countDocuments({ legacyPaymentId: pending._id })).toBe(0);

    const paid = await payment(paidFields());
    expect(await syncLegacyPayment(paid._id, { dryRun: true })).toBe("CREATED_WITH_COLLECTION");
    expect(await ChargeModel.countDocuments({ legacyPaymentId: paid._id })).toBe(0);
    expect(await CollectionModel.countDocuments({ legacyPaymentId: paid._id })).toBe(0);
  });
});

describe("syncLegacyPayment: PAID", () => {
  it("creates a PAID charge, a collection (receipt copied, cents) and a full allocation", async () => {
    const paid = await payment(paidFields());

    expect(await syncLegacyPayment(paid._id)).toBe("CREATED_WITH_COLLECTION");

    const charge = await ChargeModel.findOne({ legacyPaymentId: paid._id }).lean<any>();
    const collection = await CollectionModel.findOne({ legacyPaymentId: paid._id }).lean<any>();
    expect(charge).toMatchObject({ status: "PAID", amountCents: 30050, paidCents: 30050, balanceCents: 0 });
    expect(collection).toMatchObject({
      amountCents: 30050,
      allocatedCents: 30050,
      refundedCents: 0,
      receiptNumber: paid.receiptNumber,
      method: "TRANSFER",
      accountingDate: "2026-10-05"
    });
    const allocations = await PaymentAllocationModel.find({ collectionId: collection._id }).lean<any[]>();
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({ amountCents: 30050, reversedCents: 0 });
    expect(String(allocations[0].chargeId)).toBe(String(charge._id));
  });

  it("is idempotent: running twice leaves a single charge, collection and allocation", async () => {
    const paid = await payment(paidFields());

    await syncLegacyPayment(paid._id);
    expect(await syncLegacyPayment(paid._id)).toBe("UNCHANGED");

    expect(await ChargeModel.countDocuments({ legacyPaymentId: paid._id })).toBe(1);
    expect(await CollectionModel.countDocuments({ legacyPaymentId: paid._id })).toBe(1);
    const collection = await CollectionModel.findOne({ legacyPaymentId: paid._id }).lean<any>();
    expect(await PaymentAllocationModel.countDocuments({ collectionId: collection._id })).toBe(1);
  });

  it("marks an already mirrored OPEN charge as paid when the payment becomes PAID", async () => {
    const pending = await payment();
    await syncLegacyPayment(pending._id);

    await PaymentModel.updateOne({ _id: pending._id }, { $set: paidFields() });
    expect(await syncLegacyPayment(pending._id)).toBe("MARKED_PAID");

    const charge = await ChargeModel.findOne({ legacyPaymentId: pending._id }).lean<any>();
    expect(charge).toMatchObject({ status: "PAID", paidCents: 30050, balanceCents: 0, lockVersion: 1 });
    expect(await CollectionModel.countDocuments({ legacyPaymentId: pending._id })).toBe(1);
    expect(await syncLegacyPayment(pending._id)).toBe("UNCHANGED");
  });

  it("dry run reports MARKED_PAID for an OPEN mirror of a paid payment", async () => {
    const pending = await payment();
    await syncLegacyPayment(pending._id);
    await PaymentModel.updateOne({ _id: pending._id }, { $set: paidFields() });

    expect(await syncLegacyPayment(pending._id, { dryRun: true })).toBe("MARKED_PAID");
    expect((await ChargeModel.findOne({ legacyPaymentId: pending._id }).lean<any>()).status).toBe("OPEN");
  });

  it("CURRENT BEHAVIOUR: a charge already paid through a new-model Collection makes the legacy mark-paid a no-op (UNCHANGED, no second collection)", async () => {
    const pending = await payment();
    await syncLegacyPayment(pending._id);
    const charge = await ChargeModel.findOne({ legacyPaymentId: pending._id }).lean<any>();
    await registerCollection(
      { organizationId: String(ids.org), userId: String(ids.admin) },
      {
        studentId: String(pending.studentId),
        amountCents: 30050,
        method: "CASH",
        allocations: [{ chargeId: String(charge._id), amountCents: 30050 }]
      }
    );
    expect((await ChargeModel.findById(charge._id).lean<any>())?.status).toBe("PAID");

    await PaymentModel.updateOne({ _id: pending._id }, { $set: paidFields() });

    expect(await syncLegacyPayment(pending._id)).toBe("UNCHANGED");
    // Only the collection created by registerCollection exists: nothing is linked to the legacy payment.
    expect(await CollectionModel.countDocuments({ legacyPaymentId: pending._id })).toBe(0);
    expect(await PaymentAllocationModel.countDocuments({ chargeId: charge._id })).toBe(1);
  });
});

describe("syncLegacyPayment: CANCELLED", () => {
  it("voids an OPEN mirror and releases its chargeKey", async () => {
    const pending = await payment();
    await syncLegacyPayment(pending._id);
    await PaymentModel.updateOne(
      { _id: pending._id },
      { $set: { status: "CANCELLED", cancelledAt: new Date("2026-10-06T15:00:00.000Z"), cancellationReason: "Error de carga" } }
    );

    expect(await syncLegacyPayment(pending._id)).toBe("VOIDED");

    const charge = await ChargeModel.findOne({ legacyPaymentId: pending._id }).lean<any>();
    expect(charge).toMatchObject({ status: "VOID", paidCents: 0, balanceCents: 0, voidReason: "Error de carga" });
    expect(charge.chargeKey).toBeUndefined();
    expect(await syncLegacyPayment(pending._id)).toBe("UNCHANGED");
    expect(await RefundModel.countDocuments({ legacyPaymentId: pending._id })).toBe(0);
  });

  it("runtime mode: cancelling a PAID payment refunds the collection (dated at cancellation) and voids the charge", async () => {
    const paid = await payment(paidFields());
    await syncLegacyPayment(paid._id);
    const cancelledAt = new Date("2026-10-06T15:00:00.000Z");
    await PaymentModel.updateOne({ _id: paid._id }, { $set: { status: "CANCELLED", cancelledAt, cancellationReason: "Devolucion" } });

    expect(await syncLegacyPayment(paid._id, { mode: "runtime" })).toBe("REFUNDED_AND_VOIDED");

    const charge = await ChargeModel.findOne({ legacyPaymentId: paid._id }).lean<any>();
    const collection = await CollectionModel.findOne({ legacyPaymentId: paid._id }).lean<any>();
    const refunds = await RefundModel.find({ legacyPaymentId: paid._id }).lean<any[]>();
    expect(charge).toMatchObject({ status: "VOID", paidCents: 0, balanceCents: 0 });
    expect(collection).toMatchObject({ allocatedCents: 0, refundedCents: 30050 });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amountCents: 30050, reason: "Devolucion", method: "TRANSFER", accountingDate: "2026-10-06" });
    expect(refunds[0].refundedAt).toEqual(cancelledAt);
    const allocation = await PaymentAllocationModel.findOne({ collectionId: collection._id }).lean<any>();
    expect(allocation.reversedCents).toBe(30050);

    // Replaying does not refund twice.
    expect(await syncLegacyPayment(paid._id, { mode: "runtime" })).toBe("UNCHANGED");
    expect(await RefundModel.countDocuments({ legacyPaymentId: paid._id })).toBe(1);
  });

  it("migration mode: a paid-then-cancelled mirror is NOT voided or refunded; it only raises LEGACY_PAID_THEN_CANCELLED", async () => {
    const paid = await payment(paidFields());
    await syncLegacyPayment(paid._id);
    await PaymentModel.updateOne({ _id: paid._id }, { $set: { status: "CANCELLED", cancelledAt: new Date("2026-10-06T15:00:00.000Z") } });

    expect(await syncLegacyPayment(paid._id, { mode: "migration" })).toBe("ISSUE");

    const charge = await ChargeModel.findOne({ legacyPaymentId: paid._id }).lean<any>();
    expect(charge).toMatchObject({ status: "PAID", paidCents: 30050 });
    expect(await RefundModel.countDocuments({ legacyPaymentId: paid._id })).toBe(0);
    expect(await MigrationIssueModel.countDocuments({ kind: "LEGACY_PAID_THEN_CANCELLED", entityId: paid._id })).toBe(1);

    // Re-running keeps a single issue (upsert) and still changes nothing else.
    expect(await syncLegacyPayment(paid._id, { mode: "migration" })).toBe("ISSUE");
    expect(await MigrationIssueModel.countDocuments({ kind: "LEGACY_PAID_THEN_CANCELLED", entityId: paid._id })).toBe(1);
  });

  it("an unmirrored payment found already cancelled is created VOID without chargeKey; if it was paid it is also reported", async () => {
    const cancelled = await payment({ status: "CANCELLED", cancelledAt: new Date("2026-10-06T15:00:00.000Z") });
    expect(await syncLegacyPayment(cancelled._id, { mode: "migration" })).toBe("VOIDED");
    const voided = await ChargeModel.findOne({ legacyPaymentId: cancelled._id }).lean<any>();
    expect(voided).toMatchObject({ status: "VOID", balanceCents: 0 });
    expect(voided.chargeKey).toBeUndefined();

    const paidThenCancelled = await payment({ ...paidFields(), status: "CANCELLED", cancelledAt: new Date("2026-10-06T15:00:00.000Z") });
    expect(await syncLegacyPayment(paidThenCancelled._id, { mode: "migration" })).toBe("ISSUE");
    expect(await MigrationIssueModel.countDocuments({ kind: "LEGACY_PAID_THEN_CANCELLED", entityId: paidThenCancelled._id })).toBe(1);
    expect(await ChargeModel.countDocuments({ legacyPaymentId: paidThenCancelled._id })).toBe(1);
  });
});

describe("syncLegacyPayment: issues", () => {
  it("a payment without class produces LEGACY_PAYMENT_WITHOUT_CLASS (idempotent) and no charge", async () => {
    const orphan = await payment({ classId: undefined, concept: "Sin clase" });

    expect(await syncLegacyPayment(orphan._id)).toBe("ISSUE");
    expect(await syncLegacyPayment(orphan._id)).toBe("ISSUE");

    const issues = await MigrationIssueModel.find({ kind: "LEGACY_PAYMENT_WITHOUT_CLASS", entityId: orphan._id }).lean<any[]>();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ status: "OPEN", entityType: "Payment", data: { amount: 300.5, status: "PENDING", period: "2026-10" } });
    expect(await ChargeModel.countDocuments({ legacyPaymentId: orphan._id })).toBe(0);
  });

  it("dry run of a payment without class reports ISSUE without writing the issue", async () => {
    const orphan = await payment({ classId: undefined });

    expect(await syncLegacyPayment(orphan._id, { dryRun: true })).toBe("ISSUE");
    expect(await MigrationIssueModel.countDocuments({ entityId: orphan._id })).toBe(0);
  });

  // BUG (not fixed here): the duplicate-key error of the first ChargeModel.create aborts the MongoDB
  // transaction, so the fallback create (without chargeKey) fails with NoSuchTransaction, a
  // TransientTransactionError. session.withTransaction() then retries the whole callback, which
  // fails the same way, looping until the driver's 120s limit; no LEGACY_DUPLICATE_CHARGE issue is
  // persisted (it rolls back). Verified with a probe: first create -> code 11000, second -> code 251.
  // A fix needs to check for the existing chargeKey before creating, or do the fallback outside the
  // aborted transaction. Expected behaviour once fixed:
  //   outcome "ISSUE", one open LEGACY_DUPLICATE_CHARGE issue, a mirror charge without chargeKey,
  //   and a second run returns "UNCHANGED".
  it.todo("a charge already holding the identity produces LEGACY_DUPLICATE_CHARGE and keeps the history without key (BUG: transaction aborted by the duplicate key, sync loops)");

  it("per-class payment without sessionId nor classDate has no chargeKey (no identity guard)", async () => {
    const perClass = await payment({ paymentType: "PER_CLASS", concept: "Clase suelta" });
    await syncLegacyPayment(perClass._id);
    const charge = await ChargeModel.findOne({ legacyPaymentId: perClass._id }).lean<any>();
    expect(charge).toMatchObject({ kind: "CLASS_FEE", status: "OPEN" });
    expect(charge.chargeKey).toBeUndefined();
  });
});

describe("mirrorLegacyPayment", () => {
  it("mirrors the payment and returns the sync outcome", async () => {
    const pending = await payment();
    expect(await mirrorLegacyPayment(pending._id)).toBe("CREATED");
    expect(await ChargeModel.countDocuments({ legacyPaymentId: pending._id })).toBe(1);
  });

  it("never throws: a sync failure is logged and recorded as LEGACY_SYNC_FAILED", async () => {
    const pending = await payment();
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spy = vi.spyOn(ChargeModel, "findOne").mockImplementationOnce(() => {
      throw new Error("boom");
    });

    try {
      expect(await mirrorLegacyPayment(pending._id)).toBe("ISSUE");
    } finally {
      spy.mockRestore();
      logger.mockRestore();
    }

    const issue = await MigrationIssueModel.findOne({ kind: "LEGACY_SYNC_FAILED", entityId: pending._id }).lean<any>();
    expect(issue?.data?.error).toBe("boom");
    expect(await ChargeModel.countDocuments({ legacyPaymentId: pending._id })).toBe(0);
    // A later retry works.
    expect(await mirrorLegacyPayment(pending._id)).toBe("CREATED");
  });
});
