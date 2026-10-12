import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startReplicaSet } from "../../test/mongo";
import { PaymentModel } from "../payments/payment.model";
import { ChargeModel, classChargeKey, classDayChargeKey, monthlyChargeKey } from "./charge.model";
import {
  legacyChargeKey,
  legacyPaymentToChargeFields,
  legacyPaymentToChargeView,
  legacyPaymentToCollectionFields,
  unmirroredLegacyPayments,
  type LegacyPaymentLike
} from "./legacy-adapter";
import { syncLegacyPayment } from "./legacy-sync";

const org = new Types.ObjectId();
const branch = new Types.ObjectId();

function like(overrides: Partial<LegacyPaymentLike> = {}): LegacyPaymentLike {
  return {
    _id: new Types.ObjectId(),
    organizationId: org,
    branchId: branch,
    studentId: new Types.ObjectId(),
    classId: new Types.ObjectId(),
    paymentType: "MONTHLY",
    concept: "Cuota",
    period: "2026-10",
    amount: 123.45,
    dueDate: new Date("2026-10-10T12:00:00.000Z"),
    status: "PENDING",
    ...overrides
  };
}

describe("legacyChargeKey", () => {
  it("monthly payments use student, class and period", () => {
    const payment = like();
    expect(legacyChargeKey(payment)).toBe(monthlyChargeKey(payment.studentId, payment.classId, "2026-10"));
  });

  it("per-class payments prefer the session, then fall back to the class day", () => {
    const sessionId = new Types.ObjectId();
    const withSession = like({ paymentType: "PER_CLASS", sessionId, classDate: new Date("2026-10-07T15:00:00.000Z") });
    expect(legacyChargeKey(withSession)).toBe(classChargeKey(withSession.studentId, sessionId));

    const withDay = like({ paymentType: "PER_CLASS", classDate: new Date("2026-10-07T15:00:00.000Z") });
    expect(legacyChargeKey(withDay)).toBe(classDayChargeKey(withDay.studentId, withDay.classId, "2026-10-07"));
  });

  it("has no identity without class, or per-class without session nor day", () => {
    expect(legacyChargeKey(like({ classId: undefined }))).toBeUndefined();
    expect(legacyChargeKey(like({ paymentType: "PER_CLASS" }))).toBeUndefined();
  });
});

describe("legacyPaymentToChargeFields", () => {
  it("converts pesos to integer cents without floating drift", () => {
    expect(legacyPaymentToChargeFields(like({ amount: 0.1 + 0.2 })).amountCents).toBe(30);
    expect(legacyPaymentToChargeFields(like({ amount: 19.99 })).amountCents).toBe(1999);
  });

  it("PENDING and OVERDUE are OPEN with the full balance", () => {
    for (const status of ["PENDING", "OVERDUE"] as const) {
      expect(legacyPaymentToChargeFields(like({ status }))).toMatchObject({
        status: "OPEN",
        paidCents: 0,
        balanceCents: 12345,
        kind: "MONTHLY_FEE",
        origin: "MIGRATED",
        dueDate: "2026-10-10"
      });
    }
  });

  it("PAID has paidCents = amount and no balance", () => {
    expect(legacyPaymentToChargeFields(like({ status: "PAID" }))).toMatchObject({ status: "PAID", paidCents: 12345, balanceCents: 0 });
  });

  it("CANCELLED is VOID, releases the chargeKey and keeps a default or the given reason", () => {
    const withoutReason = legacyPaymentToChargeFields(like({ status: "CANCELLED" }));
    expect(withoutReason).toMatchObject({ status: "VOID", balanceCents: 0, voidReason: "Cancelado en el sistema anterior" });
    expect(withoutReason.chargeKey).toBeUndefined();

    const cancelledAt = new Date("2026-10-06T15:00:00.000Z");
    expect(legacyPaymentToChargeFields(like({ status: "CANCELLED", cancelledAt, cancellationReason: "Duplicado" }))).toMatchObject({
      voidedAt: cancelledAt,
      voidReason: "Duplicado"
    });
  });

  it("per-class payments become CLASS_FEE with service date", () => {
    expect(legacyPaymentToChargeFields(like({ paymentType: "PER_CLASS", classDate: new Date("2026-10-07T15:00:00.000Z") }))).toMatchObject({
      kind: "CLASS_FEE",
      serviceDate: "2026-10-07"
    });
  });
});

describe("legacyPaymentToCollectionFields", () => {
  it("copies receipt, method, proof and cents; allocated equals amount", () => {
    const paidAt = new Date("2026-10-05T15:00:00.000Z");
    const fields = legacyPaymentToCollectionFields(
      like({
        status: "PAID",
        paidAt,
        paymentMethod: "CARD",
        receiptNumber: "R-1",
        proofUrl: "https://old/proof.png",
        proof: { publicId: "p1", resourceType: "image", uploadedAt: paidAt }
      })
    );
    expect(fields).toMatchObject({
      receivedAt: paidAt,
      accountingDate: "2026-10-05",
      method: "CARD",
      amountCents: 12345,
      allocatedCents: 12345,
      refundedCents: 0,
      receiptNumber: "R-1",
      legacyProofUrl: "https://old/proof.png",
      proof: { publicId: "p1" }
    });
  });

  it("defaults method to OTHER and date to updatedAt, then createdAt", () => {
    const updatedAt = new Date("2026-10-04T15:00:00.000Z");
    expect(legacyPaymentToCollectionFields(like({ updatedAt, createdAt: new Date("2026-09-01T15:00:00.000Z") }))).toMatchObject({
      method: "OTHER",
      receivedAt: updatedAt
    });
    const createdAt = new Date("2026-09-01T15:00:00.000Z");
    expect(legacyPaymentToCollectionFields(like({ createdAt })).receivedAt).toEqual(createdAt);
  });

  it("omits proof when it has no publicId", () => {
    expect(legacyPaymentToCollectionFields(like({ proof: { publicId: "", resourceType: "image", uploadedAt: new Date() } }))).not.toHaveProperty("proof");
  });
});

describe("legacyPaymentToChargeView", () => {
  it("uses the payment id as charge id and flags it as legacy", () => {
    const payment = like();
    expect(legacyPaymentToChargeView(payment)).toMatchObject({ _id: payment._id, legacy: true, legacyPaymentId: payment._id, status: "OPEN" });
  });
});

describe("unmirroredLegacyPayments", () => {
  let database: { stop: () => Promise<void> };
  const orgId = new Types.ObjectId();

  const create = (overrides: Record<string, unknown> = {}) =>
    PaymentModel.create({
      organizationId: orgId,
      branchId: branch,
      studentId: new Types.ObjectId(),
      classId: new Types.ObjectId(),
      paymentType: "MONTHLY",
      concept: "Cuota",
      period: "2026-10",
      amount: 100,
      dueDate: new Date("2026-10-10T12:00:00.000Z"),
      status: "PENDING",
      ...overrides
    });

  beforeAll(async () => {
    database = await startReplicaSet();
  }, 120_000);

  afterAll(async () => {
    await database.stop();
  });

  it("returns [] for an empty match", async () => {
    expect(await unmirroredLegacyPayments({ organizationId: new Types.ObjectId() })).toEqual([]);
  });

  it("returns only payments that have no mirror charge", async () => {
    const mirrored = await create();
    const pending = await create();
    const paid = await create({ status: "PAID", paidAt: new Date("2026-10-05T15:00:00.000Z") });
    await syncLegacyPayment(mirrored._id);

    const result = await unmirroredLegacyPayments({ organizationId: orgId });

    expect(result.map((item) => String(item._id)).sort()).toEqual([String(pending._id), String(paid._id)].sort());
    expect(await ChargeModel.countDocuments({ legacyPaymentId: mirrored._id })).toBe(1);

    await syncLegacyPayment(pending._id);
    await syncLegacyPayment(paid._id);
    expect(await unmirroredLegacyPayments({ organizationId: orgId })).toEqual([]);
  });

  it("applies the given filter", async () => {
    const target = await create({ period: "2026-11" });
    await create({ period: "2026-12" });

    const result = await unmirroredLegacyPayments({ organizationId: orgId, period: "2026-11" });

    expect(result.map((item) => String(item._id))).toEqual([String(target._id)]);
  });
});
