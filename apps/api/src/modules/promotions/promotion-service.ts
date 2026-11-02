import { Types, type ClientSession } from "mongoose";
import { academyNow, periodBounds } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { prorateCents } from "../../common/money";
import { DanceClassModel } from "../classes/class.model";
import { ChargeModel, type Charge } from "../billing/charge.model";
import { FinancialAdjustmentModel } from "../billing/financial-adjustment.model";
import { HolidayModel } from "../scheduling/holiday.model";
import { loadRules } from "../scheduling/schedule-service";
import { planOccurrences } from "../scheduling/session-generator";
import { ClassSessionModel } from "../sessions/class-session.model";
import { PromotionModel, type Promotion } from "./promotion.model";
import { PromotionPairModel } from "./promotion-pair.model";

export interface PromotionQuote {
  promotionId: Types.ObjectId;
  promotionPairId?: Types.ObjectId;
  promotionName: string;
  discountCents: number;
}

export interface PromotionContext {
  organizationId: string;
  classId: Types.ObjectId | string;
  studentId: Types.ObjectId | string;
  enrollment?: { seriesIds?: Types.ObjectId[]; priceOverride?: { monthlyCents?: number; perClassCents?: number } } | null;
  kind: "MONTHLY_FEE" | "CLASS_FEE";
  period: string;
  serviceDate?: string;
  sessionId?: Types.ObjectId | string;
  amountCents: number;
  dbSession?: ClientSession;
  /** Preview only: evaluate the chosen 2x1 before its pair record is saved. */
  assumeBeneficiaryPromotionId?: string;
}

async function eligibleMonthlyCents(context: PromotionContext, promotion: Promotion) {
  const { from, to } = periodBounds(context.period);
  if (promotion.benefitFrom <= from && promotion.benefitTo >= to && !promotion.sessionId) return context.amountCents;
  const danceClass = await DanceClassModel.findOne({ _id: context.classId, organizationId: context.organizationId })
    .session(context.dbSession ?? null).lean<any>();
  if (!danceClass) return 0;
  const [rules, holidays] = await Promise.all([
    loadRules(context.organizationId, { classIds: [danceClass._id], from, to }),
    HolidayModel.find({ organizationId: context.organizationId, date: { $gte: from, $lte: to } })
      .session(context.dbSession ?? null).lean()
  ]);
  const series = context.enrollment?.seriesIds?.length
    ? new Set(context.enrollment.seriesIds.map(String)) : undefined;
  const occurrences = planOccurrences([danceClass], rules, holidays, from, to).filter(
    (item) => !item.holiday && (!series || series.has(String(item.rule.seriesId)))
  );
  if (!occurrences.length) return 0;
  let targetSeries: string | undefined;
  if (promotion.sessionId) {
    const session = await ClassSessionModel.findOne({ _id: promotion.sessionId, organizationId: context.organizationId })
      .session(context.dbSession ?? null).select("seriesId sessionDate").lean<any>();
    if (!session) return 0;
    targetSeries = session.seriesId ? String(session.seriesId) : undefined;
  }
  const included = occurrences.filter((item) =>
    item.date >= promotion.benefitFrom && item.date <= promotion.benefitTo &&
    (!promotion.sessionId || (item.date === promotion.benefitFrom && (!targetSeries || String(item.rule.seriesId) === targetSeries)))
  ).length;
  return prorateCents(context.amountCents, included, occurrences.length);
}

/** The same quote is used by previews and every charge entry point. No existing charge is mutated here. */
export async function quotePromotion(context: PromotionContext): Promise<PromotionQuote | null> {
  if (context.amountCents <= 0) return null;
  const { from, to } = context.kind === "MONTHLY_FEE"
    ? periodBounds(context.period)
    : { from: context.serviceDate!, to: context.serviceDate! };
  const promotions = await PromotionModel.find({
    organizationId: context.organizationId,
    classId: context.classId,
    appliesTo: context.kind,
    benefitFrom: { $lte: to },
    benefitTo: { $gte: from },
    $or: [{ status: "ACTIVE" }, { kind: "TWO_FOR_ONE" }]
  }).session(context.dbSession ?? null).lean<(Promotion & { _id: Types.ObjectId })[]>();
  const matches: PromotionQuote[] = [];
  for (const promotion of promotions) {
    let pairId: Types.ObjectId | undefined;
    if (promotion.kind === "TWO_FOR_ONE") {
      if (context.assumeBeneficiaryPromotionId !== String(promotion._id)) {
        const pair = await PromotionPairModel.findOne({
          organizationId: context.organizationId,
          promotionId: promotion._id,
          beneficiaryStudentId: context.studentId,
          voidedAt: { $exists: false },
          benefitFrom: { $lte: to }, benefitTo: { $gte: from }
        }).session(context.dbSession ?? null).lean();
        if (!pair) continue;
        pairId = pair._id;
      }
    } else if (context.enrollment?.priceOverride?.monthlyCents !== undefined && context.kind === "MONTHLY_FEE" ||
      context.enrollment?.priceOverride?.perClassCents !== undefined && context.kind === "CLASS_FEE") {
      // An explicitly negotiated price wins over an automatic campaign.
      continue;
    }
    if (context.kind === "CLASS_FEE" && promotion.sessionId && String(promotion.sessionId) !== String(context.sessionId)) continue;
    const eligibleCents = context.kind === "MONTHLY_FEE"
      ? await eligibleMonthlyCents(context, promotion)
      : context.amountCents;
    if (eligibleCents <= 0) continue;
    let discountCents = 0;
    switch (promotion.kind) {
      case "TWO_FOR_ONE": discountCents = eligibleCents; break;
      case "PERCENT": discountCents = Math.round(eligibleCents * (promotion.percentBasisPoints ?? 0) / 10000); break;
      case "AMOUNT_OFF": discountCents = Math.min(eligibleCents, promotion.valueCents ?? 0); break;
      case "FINAL_PRICE": discountCents = Math.max(0, eligibleCents - (promotion.valueCents ?? eligibleCents)); break;
    }
    if (discountCents > 0) matches.push({
      promotionId: promotion._id, promotionPairId: pairId,
      promotionName: promotion.name, discountCents: Math.min(context.amountCents, discountCents)
    });
  }
  if (matches.length > 1) throw new AppError(409, "Hay promociones superpuestas para este alumno y cargo", "PROMOTION_CONFLICT");
  return matches[0] ?? null;
}

export function promotedChargeFields(amountCents: number, quote: PromotionQuote | null) {
  const discount = quote?.discountCents ?? 0;
  return {
    adjustmentsCents: -discount,
    balanceCents: amountCents - discount,
    status: amountCents - discount > 0 ? "OPEN" as const : "PAID" as const,
    ...(quote ? {
      promotionId: quote.promotionId,
      promotionPairId: quote.promotionPairId,
      promotionName: quote.promotionName,
      promotionDiscountCents: discount
    } : {})
  };
}

/** Must run in the same transaction that inserts the promoted charge. */
export async function recordPromotionAdjustment(
  charge: Pick<Charge, "organizationId" | "studentId" | "promotionId" | "promotionPairId" | "promotionName" | "promotionDiscountCents"> & { _id: Types.ObjectId },
  dbSession?: ClientSession,
  userId?: string
) {
  if (!charge.promotionId || !charge.promotionDiscountCents) return;
  await FinancialAdjustmentModel.create([{
    organizationId: charge.organizationId,
    studentId: charge.studentId,
    chargeId: charge._id,
    promotionId: charge.promotionId,
    promotionPairId: charge.promotionPairId,
    type: "DISCOUNT",
    amountCents: -charge.promotionDiscountCents,
    reason: `Promoción: ${charge.promotionName ?? "descuento"}`,
    accountingDate: academyNow().date,
    sourceChargeIds: [],
    createdByUserId: userId ? new Types.ObjectId(userId) : undefined
  }], { session: dbSession });
}

/** Used when a new pair qualifies after the first student's charge was already generated. */
export async function applyPromotionToExistingCharge(
  charge: Charge & { _id: Types.ObjectId; lockVersion: number },
  context: PromotionContext,
  dbSession: ClientSession | undefined,
  userId: string
) {
  if (charge.status === "VOID" || charge.promotionId) return false;
  const quote = await quotePromotion({ ...context, amountCents: charge.amountCents, dbSession });
  if (!quote) return false;
  if (charge.balanceCents < quote.discountCents) {
    throw new AppError(409, "La cuota ya tiene cobros; resolvé el saldo a favor o devolución antes de aplicar el 2x1", "PROMOTION_PAID_CHARGE");
  }
  const updated = await ChargeModel.findOneAndUpdate(
    { _id: charge._id, organizationId: context.organizationId, lockVersion: charge.lockVersion, promotionId: { $exists: false } },
    {
      $inc: { adjustmentsCents: -quote.discountCents, balanceCents: -quote.discountCents, lockVersion: 1 },
      $set: {
        promotionId: quote.promotionId, promotionPairId: quote.promotionPairId,
        promotionName: quote.promotionName, promotionDiscountCents: quote.discountCents,
        status: charge.balanceCents === quote.discountCents ? "PAID" : "OPEN"
      }
    },
    { new: true, session: dbSession }
  );
  if (!updated) throw new AppError(409, "El cargo cambió mientras se aplicaba la promoción", "CHARGE_BALANCE_CHANGED");
  await recordPromotionAdjustment(updated, dbSession, userId);
  return true;
}
