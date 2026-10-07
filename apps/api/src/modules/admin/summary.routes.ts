import { Router } from "express";
import { Types } from "mongoose";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { academyNow } from "../../common/dates";
import { toPesos } from "../../common/money";
import { chargeState, openCharges } from "../billing/balance-service";
import { CollectionModel } from "../billing/collection.model";
import { unmirroredLegacyPayments } from "../billing/legacy-adapter";
import { RefundModel } from "../billing/refund.model";
import { ProfessorModel } from "../professors/professor.model";
import { StudentModel } from "../students/student.model";

export const adminSummaryRouter = Router();

adminSummaryRouter.get("/", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const organizationObjectId = new Types.ObjectId(organizationId);
    const now = new Date();

    const today = academyNow(now).date;

    const [activeStudents, activeProfessors, activeClasses, activeEnrollments, open, collected, refunded, legacyPaid] =
      await Promise.all([
        StudentModel.countDocuments({ organizationId, isActive: true }),
        ProfessorModel.countDocuments({ organizationId, isActive: true }),
        DanceClassModel.countDocuments({ organizationId, status: { $in: ["ACTIVE", "PAUSED"] } }),
        EnrollmentModel.countDocuments({ organizationId, status: "ACTIVE" }),
        openCharges(organizationId),
        CollectionModel.aggregate([
          { $match: { organizationId: organizationObjectId } },
          { $group: { _id: null, total: { $sum: "$amountCents" } } }
        ]),
        RefundModel.aggregate([
          { $match: { organizationId: organizationObjectId } },
          { $group: { _id: null, total: { $sum: "$amountCents" } } }
        ]),
        unmirroredLegacyPayments({ organizationId, status: "PAID" })
      ]);

    // Same definitions as every other screen (balance-service): a charge due today is pending.
    const states = open.map((charge) => chargeState(charge, today));
    response.json({
      activeStudents,
      activeProfessors,
      activeClasses,
      activeEnrollments,
      pendingPayments: states.filter((state) => state.balanceCents > 0 && !state.overdue).length,
      overduePayments: states.filter((state) => state.overdue).length,
      collectedAmount:
        toPesos((collected[0]?.total ?? 0) - (refunded[0]?.total ?? 0)) +
        legacyPaid.reduce((sum, payment) => sum + payment.amount, 0)
    });
  } catch (error) {
    next(error);
  }
});
