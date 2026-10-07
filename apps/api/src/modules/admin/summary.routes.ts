import { Router } from "express";
import { Types } from "mongoose";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { notYetDuePaymentFilter, overduePaymentFilter } from "../payments/payment-status";
import { ProfessorModel } from "../professors/professor.model";
import { StudentModel } from "../students/student.model";

export const adminSummaryRouter = Router();

adminSummaryRouter.get("/", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const organizationObjectId = new Types.ObjectId(organizationId);
    const now = new Date();

    const [
      activeStudents,
      activeProfessors,
      activeClasses,
      activeEnrollments,
      pendingPayments,
      overduePayments,
      collected
    ] = await Promise.all([
      StudentModel.countDocuments({ organizationId, isActive: true }),
      ProfessorModel.countDocuments({ organizationId, isActive: true }),
      DanceClassModel.countDocuments({ organizationId, status: "ACTIVE" }),
      EnrollmentModel.countDocuments({ organizationId, status: "ACTIVE" }),
      PaymentModel.countDocuments({ organizationId, ...notYetDuePaymentFilter(now) }),
      PaymentModel.countDocuments({ organizationId, ...overduePaymentFilter(now) }),
      PaymentModel.aggregate([
        { $match: { organizationId: organizationObjectId, status: "PAID" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    response.json({
      activeStudents,
      activeProfessors,
      activeClasses,
      activeEnrollments,
      pendingPayments,
      overduePayments,
      collectedAmount: collected[0]?.total ?? 0
    });
  } catch (error) {
    next(error);
  }
});
