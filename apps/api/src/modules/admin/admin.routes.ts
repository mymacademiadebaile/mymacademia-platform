import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import { adminSummaryRouter } from "./summary.routes";
import { adminCatalogsRouter } from "./catalogs.routes";
import { adminProfessorsRouter } from "./professors.routes";
import { adminStudentsRouter } from "./students.routes";
import { adminClassesRouter } from "./classes.routes";
import { adminPaymentsRouter } from "./payments.routes";
import { adminBranchesRouter } from "./branches.routes";
import { adminSettingsRouter } from "./settings.routes";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));
adminRouter.use("/summary", adminSummaryRouter);
adminRouter.use("/branches", adminBranchesRouter);
adminRouter.use("/catalogs", adminCatalogsRouter);
adminRouter.use("/professors", adminProfessorsRouter);
adminRouter.use("/students", adminStudentsRouter);
adminRouter.use("/classes", adminClassesRouter);
adminRouter.use("/payments", adminPaymentsRouter);
adminRouter.use("/settings", adminSettingsRouter);
