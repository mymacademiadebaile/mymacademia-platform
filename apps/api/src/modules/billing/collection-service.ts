import type { AdjustmentType, CollectionMethod } from "@mym/shared";
import { Types, type ClientSession } from "mongoose";
import { academyDateOf, academyNow } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { withTransaction } from "../../common/transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { nextReceiptNumber } from "../payments/sequence.model";
import { StudentModel } from "../students/student.model";
import { ChargeModel } from "./charge.model";
import { availableCreditCents, CollectionModel } from "./collection.model";
import { FinancialAdjustmentModel } from "./financial-adjustment.model";
import { PaymentAllocationModel } from "./payment-allocation.model";
import { RefundModel } from "./refund.model";

export interface Actor {
  organizationId: string;
  userId: string;
}

async function audit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: Types.ObjectId,
  metadata: Record<string, unknown>,
  dbSession?: ClientSession
) {
  await AuditLogModel.create(
    [{ organizationId: actor.organizationId, actorUserId: actor.userId, action, entityType, entityId, metadata }],
    { session: dbSession }
  );
}

/**
 * Applies money to a charge atomically: the update only succeeds if the charge is still open and
 * its balance covers the amount, so two concurrent collections cannot overpay it.
 */
async function applyToCharge(organizationId: string, chargeId: Types.ObjectId, amountCents: number, dbSession?: ClientSession) {
  const charge = await ChargeModel.findOneAndUpdate(
    { _id: chargeId, organizationId, status: "OPEN", balanceCents: { $gte: amountCents } },
    { $inc: { paidCents: amountCents, balanceCents: -amountCents, lockVersion: 1 } },
    { new: true, session: dbSession }
  );
  if (!charge) {
    throw new AppError(409, "El cargo ya no tiene ese saldo pendiente", "CHARGE_BALANCE_CHANGED");
  }
  if (charge.balanceCents <= 0 && charge.status === "OPEN") {
    charge.status = "PAID";
    await charge.save({ session: dbSession });
  }
  return charge;
}

/** Undoes money applied to a charge (refund of an allocation): the charge is owed again. */
async function unapplyFromCharge(organizationId: string, chargeId: Types.ObjectId, amountCents: number, dbSession?: ClientSession) {
  const charge = await ChargeModel.findOneAndUpdate(
    { _id: chargeId, organizationId, paidCents: { $gte: amountCents }, status: { $ne: "VOID" } },
    { $inc: { paidCents: -amountCents, balanceCents: amountCents, lockVersion: 1 }, $set: { status: "OPEN" } },
    { new: true, session: dbSession }
  );
  if (!charge) throw new AppError(409, "El cargo cambió mientras se registraba la devolución", "CHARGE_BALANCE_CHANGED");
  return charge;
}

export interface CollectionInput {
  studentId: string;
  amountCents: number;
  method: CollectionMethod;
  receivedAt?: Date;
  notes?: string;
  /** Explicit allocations. When absent and `autoAllocate` is set, the oldest open charges are paid first. */
  allocations?: Array<{ chargeId: string; amountCents: number }>;
  autoAllocate?: boolean;
  /** Optional discount granted while collecting, applied to the first allocated charge. */
  discount?: { chargeId: string; amountCents: number; reason: string };
  sessionId?: string;
  idempotencyKey?: string;
}

/**
 * Registers money received. One collection may pay several charges, part of a charge, or leave
 * credit in favour of the student. Everything (collection, allocations, charge balances,
 * receipt number) is written in one transaction. A repeated request with the same idempotency
 * key returns the first result instead of charging twice.
 */
export async function registerCollection(actor: Actor, input: CollectionInput) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError(422, "El importe debe ser mayor a cero", "INVALID_AMOUNT");
  }
  const receivedAt = input.receivedAt ?? new Date();
  if (receivedAt.getTime() > Date.now() + 5 * 60_000) {
    throw new AppError(422, "La fecha de cobro no puede ser futura", "FUTURE_PAYMENT_DATE");
  }

  if (input.idempotencyKey) {
    const existing = await CollectionModel.findOne({ organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey });
    if (existing) return { collection: existing, allocations: await PaymentAllocationModel.find({ collectionId: existing._id }), replayed: true };
  }

  const student = await StudentModel.findOne({ _id: input.studentId, organizationId: actor.organizationId }).lean<any>();
  if (!student) throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");

  try {
    return await withTransaction(async (dbSession) => {
      // Discount first, so the allocation sees the reduced balance.
      if (input.discount && input.discount.amountCents > 0) {
        await applyAdjustmentInSession(actor, {
          chargeId: input.discount.chargeId,
          type: "DISCOUNT",
          amountCents: input.discount.amountCents,
          reason: input.discount.reason
        }, dbSession);
      }

      let plan = input.allocations ?? [];
      if (!plan.length && input.autoAllocate) {
        const open = await ChargeModel.find({ organizationId: actor.organizationId, studentId: student._id, status: "OPEN", balanceCents: { $gt: 0 } })
          .sort({ dueDate: 1, createdAt: 1 })
          .session(dbSession ?? null)
          .lean<any[]>();
        let remaining = input.amountCents;
        plan = [];
        for (const charge of open) {
          if (remaining <= 0) break;
          const amount = Math.min(remaining, charge.balanceCents);
          plan.push({ chargeId: String(charge._id), amountCents: amount });
          remaining -= amount;
        }
      }

      const allocatedCents = plan.reduce((sum, item) => sum + item.amountCents, 0);
      if (plan.some((item) => !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0)) {
        throw new AppError(422, "Cada imputación debe ser mayor a cero", "INVALID_ALLOCATION");
      }
      if (allocatedCents > input.amountCents) {
        throw new AppError(422, "Las imputaciones superan el importe cobrado", "ALLOCATION_EXCEEDS_COLLECTION");
      }
      const chargeIds = plan.map((item) => new Types.ObjectId(item.chargeId));
      if (new Set(chargeIds.map(String)).size !== chargeIds.length) {
        throw new AppError(422, "Un cargo aparece dos veces", "INVALID_ALLOCATION");
      }
      const charges = await ChargeModel.find({ _id: { $in: chargeIds }, organizationId: actor.organizationId })
        .session(dbSession ?? null)
        .lean<any[]>();
      if (charges.length !== chargeIds.length || charges.some((charge) => !charge.studentId.equals(student._id))) {
        throw new AppError(422, "Los cargos deben ser del mismo alumno", "INVALID_ALLOCATION");
      }

      const [collection] = await CollectionModel.create(
        [{
          organizationId: actor.organizationId,
          branchId: student.branchId,
          studentId: student._id,
          receivedAt,
          accountingDate: academyDateOf(receivedAt),
          method: input.method,
          amountCents: input.amountCents,
          allocatedCents,
          refundedCents: 0,
          receiptNumber: await nextReceiptNumber(new Types.ObjectId(actor.organizationId), dbSession),
          notes: input.notes?.trim() || undefined,
          sessionId: input.sessionId ? new Types.ObjectId(input.sessionId) : undefined,
          idempotencyKey: input.idempotencyKey,
          createdByUserId: new Types.ObjectId(actor.userId)
        }],
        { session: dbSession }
      );

      const allocations = [];
      for (const item of plan) {
        await applyToCharge(actor.organizationId, new Types.ObjectId(item.chargeId), item.amountCents, dbSession);
        const [allocation] = await PaymentAllocationModel.create(
          [{
            organizationId: actor.organizationId,
            studentId: student._id,
            collectionId: collection._id,
            chargeId: new Types.ObjectId(item.chargeId),
            amountCents: item.amountCents,
            reversedCents: 0,
            accountingDate: collection.accountingDate,
            createdByUserId: new Types.ObjectId(actor.userId)
          }],
          { session: dbSession }
        );
        allocations.push(allocation);
      }

      await audit(actor, "COLLECTION_REGISTERED", "Collection", collection._id, {
        studentId: student._id,
        amountCents: input.amountCents,
        method: input.method,
        accountingDate: collection.accountingDate,
        receiptNumber: collection.receiptNumber,
        allocations: plan,
        creditCents: input.amountCents - allocatedCents
      }, dbSession);

      return { collection, allocations, replayed: false };
    });
  } catch (error) {
    // Two requests with the same idempotency key: the loser answers with the winner's result.
    if ((error as { code?: number })?.code === 11000 && input.idempotencyKey) {
      const existing = await CollectionModel.findOne({ organizationId: actor.organizationId, idempotencyKey: input.idempotencyKey });
      if (existing) return { collection: existing, allocations: await PaymentAllocationModel.find({ collectionId: existing._id }), replayed: true };
    }
    throw error;
  }
}

/** Applies unapplied credit of a collection to a charge of the same student. */
export async function applyCredit(actor: Actor, collectionId: string, chargeId: string, amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new AppError(422, "El importe debe ser mayor a cero", "INVALID_AMOUNT");
  return withTransaction(async (dbSession) => {
    const collection = await CollectionModel.findOneAndUpdate(
      {
        _id: collectionId,
        organizationId: actor.organizationId,
        $expr: { $gte: [{ $subtract: ["$amountCents", { $add: ["$allocatedCents", "$refundedCents"] }] }, amountCents] }
      },
      { $inc: { allocatedCents: amountCents, lockVersion: 1 } },
      { new: true, session: dbSession }
    );
    if (!collection) throw new AppError(409, "El cobro no tiene ese saldo a favor disponible", "INSUFFICIENT_CREDIT");
    const charge = await ChargeModel.findOne({ _id: chargeId, organizationId: actor.organizationId }).session(dbSession ?? null);
    if (!charge || !charge.studentId.equals(collection.studentId)) {
      throw new AppError(422, "El cargo debe ser del mismo alumno", "INVALID_ALLOCATION");
    }
    await applyToCharge(actor.organizationId, charge._id, amountCents, dbSession);
    const [allocation] = await PaymentAllocationModel.create(
      [{
        organizationId: actor.organizationId,
        studentId: collection.studentId,
        collectionId: collection._id,
        chargeId: charge._id,
        amountCents,
        reversedCents: 0,
        accountingDate: academyNow().date,
        createdByUserId: new Types.ObjectId(actor.userId)
      }],
      { session: dbSession }
    );
    await audit(actor, "CREDIT_APPLIED", "Collection", collection._id, { chargeId, amountCents }, dbSession);
    return allocation;
  });
}

export interface RefundInput {
  amountCents: number;
  reason: string;
  method: CollectionMethod;
  refundedAt?: Date;
  /** Reverse money applied to this allocation (the charge is owed again). Absent: refund credit. */
  allocationId?: string;
}

/**
 * Returns money of a collection as a new movement dated today (or `refundedAt`). The original
 * collection keeps its amount and date: closed cash days never change.
 */
export async function refundCollection(actor: Actor, collectionId: string, input: RefundInput) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError(422, "El importe debe ser mayor a cero", "INVALID_AMOUNT");
  }
  if (!input.reason?.trim()) throw new AppError(422, "Indicá el motivo de la devolución", "REASON_REQUIRED");
  const refundedAt = input.refundedAt ?? new Date();
  if (refundedAt.getTime() > Date.now() + 5 * 60_000) {
    throw new AppError(422, "La fecha de devolución no puede ser futura", "FUTURE_PAYMENT_DATE");
  }

  return withTransaction(async (dbSession) => {
    const collection = await CollectionModel.findOne({ _id: collectionId, organizationId: actor.organizationId }).session(dbSession ?? null);
    if (!collection) throw new AppError(404, "Cobro no encontrado", "COLLECTION_NOT_FOUND");
    if (academyDateOf(refundedAt) < collection.accountingDate) {
      throw new AppError(422, "La devolución no puede ser anterior al cobro", "REFUND_BEFORE_COLLECTION");
    }

    let chargeId: Types.ObjectId | undefined;
    let allocationId: Types.ObjectId | undefined;
    if (input.allocationId) {
      const allocation = await PaymentAllocationModel.findOneAndUpdate(
        {
          _id: input.allocationId,
          organizationId: actor.organizationId,
          collectionId: collection._id,
          $expr: { $gte: [{ $subtract: ["$amountCents", "$reversedCents"] }, input.amountCents] }
        },
        { $inc: { reversedCents: input.amountCents } },
        { new: true, session: dbSession }
      );
      if (!allocation) throw new AppError(409, "La imputación no tiene ese importe disponible", "INSUFFICIENT_ALLOCATION");
      await unapplyFromCharge(actor.organizationId, allocation.chargeId, input.amountCents, dbSession);
      chargeId = allocation.chargeId;
      allocationId = allocation._id;
      const updated = await CollectionModel.findOneAndUpdate(
        { _id: collection._id, allocatedCents: { $gte: input.amountCents } },
        { $inc: { allocatedCents: -input.amountCents, refundedCents: input.amountCents, lockVersion: 1 } },
        { new: true, session: dbSession }
      );
      if (!updated) throw new AppError(409, "El cobro cambió mientras se registraba la devolución", "COLLECTION_CHANGED");
    } else {
      if (availableCreditCents(collection) < input.amountCents) {
        throw new AppError(409, "El cobro no tiene ese saldo a favor; elegí qué imputación devolver", "INSUFFICIENT_CREDIT");
      }
      const updated = await CollectionModel.findOneAndUpdate(
        {
          _id: collection._id,
          $expr: { $gte: [{ $subtract: ["$amountCents", { $add: ["$allocatedCents", "$refundedCents"] }] }, input.amountCents] }
        },
        { $inc: { refundedCents: input.amountCents, lockVersion: 1 } },
        { new: true, session: dbSession }
      );
      if (!updated) throw new AppError(409, "El cobro cambió mientras se registraba la devolución", "COLLECTION_CHANGED");
    }

    const [refund] = await RefundModel.create(
      [{
        organizationId: actor.organizationId,
        branchId: collection.branchId,
        studentId: collection.studentId,
        collectionId: collection._id,
        chargeId,
        allocationId,
        amountCents: input.amountCents,
        refundedAt,
        accountingDate: academyDateOf(refundedAt),
        method: input.method,
        reason: input.reason.trim(),
        createdByUserId: new Types.ObjectId(actor.userId)
      }],
      { session: dbSession }
    );
    await audit(actor, "REFUND_REGISTERED", "Refund", refund._id, {
      collectionId,
      chargeId,
      amountCents: input.amountCents,
      reason: input.reason,
      accountingDate: refund.accountingDate
    }, dbSession);
    return refund;
  });
}

export interface AdjustmentInput {
  chargeId: string;
  type: AdjustmentType;
  /** Always positive; the sign comes from the type. */
  amountCents: number;
  reason: string;
  sourceChargeIds?: string[];
}

async function applyAdjustmentInSession(actor: Actor, input: AdjustmentInput, dbSession?: ClientSession) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError(422, "El importe debe ser mayor a cero", "INVALID_AMOUNT");
  }
  if (!input.reason?.trim()) throw new AppError(422, "Indicá el motivo del ajuste", "REASON_REQUIRED");
  const signed = input.type === "SURCHARGE" ? input.amountCents : -input.amountCents;

  const charge = await ChargeModel.findOne({ _id: input.chargeId, organizationId: actor.organizationId }).session(dbSession ?? null);
  if (!charge || charge.status === "VOID") throw new AppError(404, "Cargo no encontrado", "CHARGE_NOT_FOUND");
  if (signed < 0 && charge.balanceCents < -signed) {
    throw new AppError(422, "El descuento supera el saldo pendiente del cargo", "ADJUSTMENT_EXCEEDS_BALANCE");
  }

  if (input.sourceChargeIds?.length) {
    const sources = await ChargeModel.find({ _id: { $in: input.sourceChargeIds }, organizationId: actor.organizationId })
      .session(dbSession ?? null)
      .lean<any[]>();
    if (sources.length !== input.sourceChargeIds.length || sources.some((item) => !item.studentId.equals(charge.studentId))) {
      throw new AppError(422, "Los cargos de origen deben ser del mismo alumno", "INVALID_SOURCE_CHARGES");
    }
    const paid = sources.reduce((sum, item) => sum + item.paidCents, 0);
    if (input.type === "CREDIT_TRANSFER" && input.amountCents > paid) {
      throw new AppError(422, "El crédito supera lo pagado en los cargos de origen", "CREDIT_EXCEEDS_SOURCES");
    }
  }

  const updated = await ChargeModel.findOneAndUpdate(
    { _id: charge._id, lockVersion: charge.lockVersion },
    { $inc: { adjustmentsCents: signed, balanceCents: signed, lockVersion: 1 } },
    { new: true, session: dbSession }
  );
  if (!updated) throw new AppError(409, "El cargo cambió; volvé a intentar", "CHARGE_BALANCE_CHANGED");
  const nextStatus = updated.balanceCents <= 0 ? "PAID" : "OPEN";
  if (updated.status !== nextStatus) {
    updated.status = nextStatus;
    await updated.save({ session: dbSession });
  }

  const [adjustment] = await FinancialAdjustmentModel.create(
    [{
      organizationId: actor.organizationId,
      studentId: charge.studentId,
      chargeId: charge._id,
      type: input.type,
      amountCents: signed,
      reason: input.reason.trim(),
      accountingDate: academyNow().date,
      sourceChargeIds: (input.sourceChargeIds ?? []).map((id) => new Types.ObjectId(id)),
      createdByUserId: new Types.ObjectId(actor.userId)
    }],
    { session: dbSession }
  );
  await audit(actor, "FINANCIAL_ADJUSTMENT", "Charge", charge._id, {
    type: input.type,
    amountCents: signed,
    reason: input.reason,
    sourceChargeIds: input.sourceChargeIds
  }, dbSession);
  return adjustment;
}

/** Authorized discount, surcharge, write-off or credit transfer on a charge, with its reason. */
export async function applyAdjustment(actor: Actor, input: AdjustmentInput) {
  return withTransaction((dbSession) => applyAdjustmentInSession(actor, input, dbSession));
}
