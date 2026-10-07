import { Types, type ClientSession } from "mongoose";
import { academyDateOf } from "../../common/dates";
import { withTransaction } from "../../common/transaction";
import { PaymentModel } from "../payments/payment.model";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";
import {
  legacyPaymentToChargeFields,
  legacyPaymentToCollectionFields,
  type LegacyPaymentLike
} from "./legacy-adapter";
import { MigrationIssueModel } from "./migration-issue.model";
import { PaymentAllocationModel } from "./payment-allocation.model";
import { RefundModel } from "./refund.model";

export type SyncOutcome =
  | "CREATED"
  | "CREATED_WITH_COLLECTION"
  | "MARKED_PAID"
  | "VOIDED"
  | "REFUNDED_AND_VOIDED"
  | "UNCHANGED"
  | "ISSUE";

function isDuplicateKey(error: unknown) {
  return (error as { code?: number })?.code === 11000;
}

async function recordIssue(
  payment: LegacyPaymentLike,
  kind: string,
  message: string,
  data: Record<string, unknown> = {},
  session?: ClientSession
) {
  await MigrationIssueModel.updateOne(
    { organizationId: payment.organizationId, kind, entityId: payment._id },
    {
      $setOnInsert: {
        organizationId: payment.organizationId,
        kind,
        entityType: "Payment",
        entityId: payment._id,
        message,
        data: { amount: payment.amount, status: payment.status, period: payment.period, concept: payment.concept, ...data },
        status: "OPEN"
      }
    },
    { upsert: true, session }
  );
}

async function createCollectionFor(payment: LegacyPaymentLike, chargeId: Types.ObjectId, session?: ClientSession) {
  const fields = legacyPaymentToCollectionFields(payment);
  const [collection] = await CollectionModel.create([fields], { session });
  await PaymentAllocationModel.create(
    [{
      organizationId: payment.organizationId,
      studentId: payment.studentId,
      collectionId: collection._id,
      chargeId,
      amountCents: fields.amountCents,
      reversedCents: 0,
      accountingDate: fields.accountingDate,
      createdByUserId: payment.paidByUserId
    }],
    { session }
  );
  return collection;
}

/**
 * Mirrors one legacy Payment into Charge / Collection / PaymentAllocation / Refund. Idempotent:
 * running it again for the same payment changes nothing.
 *
 * - `runtime`: called right after an old endpoint wrote the payment. A PAID payment cancelled
 *   now becomes a refund dated today (the money left the cash box today, not on the pay day).
 * - `migration`: historical data. A payment found already cancelled after being paid cannot be
 *   told apart (refund or typing error), so it is voided and reported for review, without
 *   inventing any money movement.
 */
export async function syncLegacyPayment(
  paymentId: Types.ObjectId | string,
  options: { mode?: "runtime" | "migration"; dryRun?: boolean } = {}
): Promise<SyncOutcome> {
  const mode = options.mode ?? "runtime";
  const payment = await PaymentModel.findById(paymentId).lean<LegacyPaymentLike>();
  if (!payment) return "UNCHANGED";
  if (!payment.classId) {
    if (!options.dryRun) await recordIssue(payment, "LEGACY_PAYMENT_WITHOUT_CLASS", "Pago sin clase asociada: revisar a qué corresponde");
    return "ISSUE";
  }

  const mirror = await ChargeModel.findOne({ legacyPaymentId: payment._id }).lean<any>();
  if (options.dryRun) {
    if (!mirror) return payment.status === "PAID" ? "CREATED_WITH_COLLECTION" : "CREATED";
    if (payment.status === "PAID" && mirror.status === "OPEN") return "MARKED_PAID";
    if (payment.status === "CANCELLED" && mirror.status !== "VOID") return mirror.paidCents > 0 ? "REFUNDED_AND_VOIDED" : "VOIDED";
    return "UNCHANGED";
  }

  return withTransaction(async (session) => {
    const current = await ChargeModel.findOne({ legacyPaymentId: payment._id }).session(session ?? null);

    if (!current) {
      const fields = legacyPaymentToChargeFields(payment);
      let issue = false;
      if (payment.status === "CANCELLED" && payment.paidAt) {
        await recordIssue(
          payment,
          "LEGACY_PAID_THEN_CANCELLED",
          "Pago cobrado y luego cancelado en el sistema anterior: confirmar si hubo devolución",
          { paidAt: payment.paidAt, cancelledAt: payment.cancelledAt, reason: payment.cancellationReason },
          session
        );
        issue = true;
      }

      let charge;
      try {
        [charge] = await ChargeModel.create([fields], { session });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // The identity is already taken by a charge of the new model: keep the history without
        // the key and let an administrator decide.
        await recordIssue(
          payment,
          "LEGACY_DUPLICATE_CHARGE",
          "Ya existe otro cargo para el mismo concepto: revisar si es un cobro duplicado",
          { chargeKey: fields.chargeKey },
          session
        );
        [charge] = await ChargeModel.create([{ ...fields, chargeKey: undefined }], { session });
        issue = true;
      }

      if (payment.status === "PAID") {
        await createCollectionFor(payment, charge._id, session);
        return issue ? "ISSUE" : "CREATED_WITH_COLLECTION";
      }
      return issue ? "ISSUE" : payment.status === "CANCELLED" ? "VOIDED" : "CREATED";
    }

    if (payment.status === "PAID" && current.status === "OPEN" && current.paidCents === 0) {
      await createCollectionFor(payment, current._id, session);
      current.paidCents = current.amountCents + current.adjustmentsCents;
      current.balanceCents = 0;
      current.status = "PAID";
      current.lockVersion += 1;
      await current.save({ session });
      return "MARKED_PAID";
    }

    if (payment.status === "CANCELLED" && current.status !== "VOID") {
      let outcome: SyncOutcome = "VOIDED";
      if (current.paidCents > 0) {
        if (mode === "migration") {
          await recordIssue(
            payment,
            "LEGACY_PAID_THEN_CANCELLED",
            "Pago cobrado y luego cancelado: confirmar si hubo devolución",
            { paidAt: payment.paidAt, cancelledAt: payment.cancelledAt },
            session
          );
          return "ISSUE";
        }
        const allocations = await PaymentAllocationModel.find({ chargeId: current._id }).session(session ?? null);
        for (const allocation of allocations) {
          const remaining = allocation.amountCents - allocation.reversedCents;
          if (remaining <= 0) continue;
          const collection = await CollectionModel.findById(allocation.collectionId).session(session ?? null);
          if (!collection) continue;
          allocation.reversedCents += remaining;
          await allocation.save({ session });
          collection.allocatedCents -= remaining;
          collection.refundedCents += remaining;
          collection.lockVersion += 1;
          await collection.save({ session });
          const refundedAt = payment.cancelledAt ?? new Date();
          await RefundModel.create(
            [{
              organizationId: payment.organizationId,
              branchId: collection.branchId,
              studentId: payment.studentId,
              collectionId: collection._id,
              chargeId: current._id,
              allocationId: allocation._id,
              amountCents: remaining,
              refundedAt,
              accountingDate: academyDateOf(refundedAt),
              method: collection.method,
              reason: payment.cancellationReason ?? "Pago cancelado",
              legacyPaymentId: payment._id
            }],
            { session }
          );
        }
        outcome = "REFUNDED_AND_VOIDED";
      }
      current.status = "VOID";
      current.paidCents = 0;
      current.balanceCents = 0;
      current.chargeKey = undefined;
      current.voidedAt = payment.cancelledAt ?? new Date();
      current.voidReason = payment.cancellationReason ?? "Pago cancelado";
      current.lockVersion += 1;
      await current.save({ session });
      return outcome;
    }

    return "UNCHANGED";
  });
}

/**
 * Called by the legacy payment endpoints after they write. The payment is already saved, so a
 * mirroring failure must not fail the request: it is recorded for review and the read services
 * keep showing the payment through the legacy adapter until the migration retries it.
 */
export async function mirrorLegacyPayment(paymentId: Types.ObjectId | string) {
  try {
    return await syncLegacyPayment(paymentId, { mode: "runtime" });
  } catch (error) {
    console.error("[billing] could not mirror legacy payment", paymentId, error);
    const payment = await PaymentModel.findById(paymentId).lean<LegacyPaymentLike>();
    if (payment) {
      await recordIssue(payment, "LEGACY_SYNC_FAILED", "No se pudo replicar el pago en el nuevo modelo", {
        error: error instanceof Error ? error.message : String(error)
      }).catch(() => undefined);
    }
    return "ISSUE" as const;
  }
}
