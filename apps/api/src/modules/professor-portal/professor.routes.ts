import { Router } from "express";
import { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import { UserModel } from "../auth/user.model";
import { BranchModel } from "../core/branch.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ProfessorModel } from "../professors/professor.model";
import { StudentModel } from "../students/student.model";

export const professorPortalRouter = Router();

professorPortalRouter.use(requireAuth, requireRole("PROFESSOR"));

professorPortalRouter.get("/dashboard", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const userId = request.auth!.userId;

    const [user, professor] = await Promise.all([
      UserModel.findOne({
        _id: userId,
        organizationId,
        role: "PROFESSOR",
        isActive: true
      }).select("firstName lastName email phone branchIds"),
      ProfessorModel.findOne({
        organizationId,
        userId,
        isActive: true
      }).populate("disciplineIds", "name type")
    ]);

    if (!user || !professor) {
      throw new AppError(
        404,
        "Perfil de profesor no encontrado o inactivo",
        "PROFESSOR_PROFILE_NOT_FOUND"
      );
    }

    const classes = await DanceClassModel.find({
      organizationId,
      professorIds: professor._id,
      status: "ACTIVE"
    })
      .populate("disciplineIds segmentIds levelIds", "name type")
      .sort({ name: 1 });

    const classIds = classes.map((item) => item._id);

    const [enrollmentCounts, studentIds, branches] = await Promise.all([
      classIds.length
        ? EnrollmentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
            {
              $match: {
                organizationId: new Types.ObjectId(organizationId),
                classId: { $in: classIds },
                status: "ACTIVE"
              }
            },
            { $group: { _id: "$classId", count: { $sum: 1 } } }
          ])
        : Promise.resolve([]),
      classIds.length
        ? EnrollmentModel.distinct("studentId", {
            organizationId,
            classId: { $in: classIds },
            status: "ACTIVE"
          })
        : Promise.resolve([]),
      BranchModel.find({
        organizationId,
        _id: { $in: user.branchIds }
      }).select("name address isActive").sort({ name: 1 })
    ]);

    const students = studentIds.length
      ? await StudentModel.find({
          organizationId,
          _id: { $in: studentIds },
          isActive: true
        })
          .select("firstName lastName email phone branchId")
          .sort({ lastName: 1, firstName: 1 })
      : [];

    const countMap = new Map(
      enrollmentCounts.map((item) => [item._id.toString(), item.count])
    );

    response.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? ""
      },
      professor: {
        id: professor.id,
        displayName: professor.displayName,
        bio: professor.bio ?? "",
        instagram: professor.instagram ?? "",
        avatarUrl: professor.avatarUrl ?? "",
        disciplines: professor.disciplineIds
      },
      branches,
      classes: classes.map((item) => ({
        ...item.toObject(),
        activeEnrollmentCount: countMap.get(item.id) ?? 0
      })),
      students
    });
  } catch (error) {
    next(error);
  }
});
