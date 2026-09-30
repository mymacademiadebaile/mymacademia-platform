import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LEGACY_RECEIPT_INDEX_NAME, RECEIPT_INDEX_NAME } from "./active-charge-key";
import { planChargeKeyBackfill, runChargeKeyBackfill } from "./charge-key-backfill";
import { PaymentModel } from "./payment.model";

let mongod: MongoMemoryServer;
const org = new Types.ObjectId();
const branch = new Types.ObjectId();

type Raw = Record<string, unknown>;

// The raw driver is used on purpose: it stores "legacy" documents exactly as they were before the key existed.
function legacy(fields: Raw): Raw {
  return {
    _id: new Types.ObjectId(),
    organizationId: org,
    branchId: branch,
    studentId: new Types.ObjectId(),
    classId: new Types.ObjectId(),
    paymentType: "MONTHLY",
    concept: "Legacy",
    period: "2026-09",
    amount: 25000,
    dueDate: new Date("2026-09-10T12:00:00.000Z"),
    status: "PENDING",
    ...fields
  };
}

const insert = (...docs: Raw[]) => PaymentModel.collection.insertMany(docs as never);
const find = (id: unknown) => PaymentModel.collection.findOne({ _id: id } as never);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PaymentModel.init();
});

beforeEach(async () => {
  await PaymentModel.collection.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("planChargeKeyBackfill (pure)", () => {
  it("computes the key of an active payment and leaves correct ones alone", () => {
    const pending = legacy({});
    const plan = planChargeKeyBackfill([pending as never]);

    expect(plan.toSet).toHaveLength(1);
    expect(plan.toSet[0]!.key).toBe(`MONTHLY:${pending.studentId}:${pending.classId}:2026-09`);

    const again = planChargeKeyBackfill([{ ...pending, activeChargeKey: plan.toSet[0]!.key } as never]);
    expect(again.toSet).toHaveLength(0);
    expect(again.unchanged).toBe(1);
  });

  it("reports active payments without class separately, without a key", () => {
    const plan = planChargeKeyBackfill([legacy({ classId: undefined }) as never]);

    expect(plan.withoutClass).toBe(1);
    expect(plan.toSet).toHaveLength(0);
    expect(plan.invalid).toHaveLength(0);
  });

  it("does not invent an identity for PER_CLASS without classDate or MONTHLY without period", () => {
    const plan = planChargeKeyBackfill([
      legacy({ paymentType: "PER_CLASS", classDate: undefined }) as never,
      legacy({ paymentType: "MONTHLY", period: "not-a-period" }) as never,
      legacy({ paymentType: "MONTHLY", period: undefined }) as never
    ]);

    expect(plan.invalid).toHaveLength(3);
    expect(plan.toSet).toHaveLength(0);
  });
});

describe("runChargeKeyBackfill", () => {
  it("dry run reports what it would do and writes nothing", async () => {
    const pending = legacy({});
    const paid = legacy({ paymentType: "PER_CLASS", classDate: new Date("2026-09-29T00:00:00.000Z"), status: "PAID" });
    await insert(pending, paid);

    const result = await runChargeKeyBackfill({ apply: false });

    expect(result.applied).toBe(false);
    expect(result.plan.toSet).toHaveLength(2);
    expect(result.plan.duplicates).toHaveLength(0);
    expect(await find(pending._id)).not.toHaveProperty("activeChargeKey");
    expect(await find(paid._id)).not.toHaveProperty("activeChargeKey");
  });

  it("apply sets keys from the logical class day, whatever hour legacy data has", async () => {
    const midnight = legacy({ paymentType: "PER_CLASS", classDate: new Date("2026-09-29T00:00:00.000Z") });
    const noon = legacy({ paymentType: "PER_CLASS", classDate: new Date("2026-09-30T12:00:00.000Z") });
    await insert(midnight, noon);

    const result = await runChargeKeyBackfill({ apply: true });

    expect(result.applied).toBe(true);
    expect(result.indexPresent).toBe(true);
    expect((await find(midnight._id))?.activeChargeKey).toBe(
      `PER_CLASS:${midnight.studentId}:${midnight.classId}:2026-09-29`
    );
    expect((await find(noon._id))?.activeChargeKey).toBe(
      `PER_CLASS:${noon.studentId}:${noon.classId}:2026-09-30`
    );
  });

  it("detects existing duplicates, reports them and does not apply anything", async () => {
    const studentId = new Types.ObjectId();
    const classId = new Types.ObjectId();
    const a = legacy({ studentId, classId, concept: "Cuota septiembre" });
    const b = legacy({ studentId, classId, concept: "Mensualidad septiembre", status: "PAID" });
    const other = legacy({});
    await insert(a, b, other);

    const result = await runChargeKeyBackfill({ apply: true });

    expect(result.applied).toBe(false);
    expect(result.blockedReason).toBeDefined();
    expect(result.plan.duplicates).toHaveLength(1);
    expect(result.plan.duplicates[0]!.paymentIds.sort()).toEqual([String(a._id), String(b._id)].sort());
    // Nothing was touched, not even the unrelated payment, and nothing was deleted or cancelled.
    expect(await PaymentModel.collection.countDocuments({})).toBe(3);
    for (const doc of [a, b, other]) {
      expect(await find(doc._id)).not.toHaveProperty("activeChargeKey");
    }
    expect((await find(a._id))?.status).toBe("PENDING");
    expect((await find(b._id))?.status).toBe("PAID");
  });

  it("does not treat a cancelled payment as a duplicate", async () => {
    const studentId = new Types.ObjectId();
    const classId = new Types.ObjectId();
    await insert(legacy({ studentId, classId, status: "CANCELLED" }), legacy({ studentId, classId }));

    const result = await runChargeKeyBackfill({ apply: true });

    expect(result.applied).toBe(true);
    expect(result.plan.duplicates).toHaveLength(0);
  });

  it("aborts apply when an active payment has no usable identity", async () => {
    const broken = legacy({ paymentType: "PER_CLASS", classDate: undefined });
    const fine = legacy({});
    await insert(broken, fine);

    const result = await runChargeKeyBackfill({ apply: true });

    expect(result.applied).toBe(false);
    expect(result.plan.invalid.map((item) => item.id)).toEqual([String(broken._id)]);
    expect(await find(fine._id)).not.toHaveProperty("activeChargeKey");
  });

  it("removes a legacy key from CANCELLED payments", async () => {
    const cancelled = legacy({ status: "CANCELLED", activeChargeKey: "MONTHLY:stale:key:2026-09" });
    await insert(cancelled);

    const result = await runChargeKeyBackfill({ apply: true });

    expect(result.applied).toBe(true);
    expect(await find(cancelled._id)).not.toHaveProperty("activeChargeKey");
  });

  it("is idempotent: a second run changes nothing", async () => {
    const pending = legacy({});
    const cancelled = legacy({ status: "CANCELLED", activeChargeKey: "MONTHLY:stale:key:2026-09" });
    await insert(pending, cancelled);

    const first = await runChargeKeyBackfill({ apply: true });
    const snapshot = await PaymentModel.collection.find({}).sort({ _id: 1 }).toArray();
    const second = await runChargeKeyBackfill({ apply: true });

    expect(first.plan.toSet).toHaveLength(1);
    expect(first.plan.toUnset).toHaveLength(1);
    expect(second.applied).toBe(true);
    expect(second.plan.toSet).toHaveLength(0);
    expect(second.plan.toUnset).toHaveLength(0);
    expect(await PaymentModel.collection.find({}).sort({ _id: 1 }).toArray()).toEqual(snapshot);
  });

  it("replaces the legacy sparse receipt index, which allowed a single payment without receipt", async () => {
    await PaymentModel.collection.dropIndex(RECEIPT_INDEX_NAME);
    await PaymentModel.collection.createIndex(
      { organizationId: 1, receiptNumber: 1 },
      { unique: true, sparse: true, name: LEGACY_RECEIPT_INDEX_NAME }
    );
    // With the legacy index the second payment without receipt of an organization is rejected.
    await insert(legacy({ studentId: new Types.ObjectId() }));
    await expect(insert(legacy({ studentId: new Types.ObjectId() }))).rejects.toMatchObject({ code: 11000 });
    await PaymentModel.collection.deleteMany({});

    const result = await runChargeKeyBackfill({ apply: true });

    expect(result.droppedLegacyReceiptIndex).toBe(true);
    const names = (await PaymentModel.collection.indexes()).map((index) => index.name);
    expect(names).toContain(RECEIPT_INDEX_NAME);
    expect(names).not.toContain(LEGACY_RECEIPT_INDEX_NAME);

    await insert(legacy({ studentId: new Types.ObjectId() }), legacy({ studentId: new Types.ObjectId() }));
    await expect(
      insert(legacy({ receiptNumber: "REC-000001" }), legacy({ receiptNumber: "REC-000001" }))
    ).rejects.toMatchObject({ code: 11000 });
  });
});
