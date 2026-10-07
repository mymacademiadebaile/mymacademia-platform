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
import { adminEnrollmentsRouter } from "./enrollments.routes";
import { adminCommunicationsRouter } from "./communications.routes";
import { adminProfileRouter } from "./profile.routes";
import { adminAuditRouter } from "./audit.routes";
import { adminReportsRouter } from "./reports.routes";
import { adminTrialsRouter } from "./trials.routes";
import { adminNotificationsRouter } from "./notifications.routes";
import { adminSessionsRouter } from "./sessions.routes";
import { adminUsersRouter } from "./users.routes";
import { adminBillingRouter } from "./billing.routes";
import {
  adminCalendarRouter,
  adminHolidaysRouter,
  adminSchedulesRouter,
  adminSpacesRouter
} from "./scheduling.routes";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN", "SUPER_ADMIN"));
adminRouter.use("/profile", adminProfileRouter);
adminRouter.use("/summary", adminSummaryRouter);
adminRouter.use("/branches", adminBranchesRouter);
adminRouter.use("/catalogs", adminCatalogsRouter);
adminRouter.use("/professors", adminProfessorsRouter);
adminRouter.use("/students", adminStudentsRouter);
adminRouter.use("/classes", adminClassesRouter);
adminRouter.use("/enrollments", adminEnrollmentsRouter);
adminRouter.use("/trials", adminTrialsRouter);
adminRouter.use("/sessions", adminSessionsRouter);
adminRouter.use("/calendar", adminCalendarRouter);
adminRouter.use("/schedules", adminSchedulesRouter);
adminRouter.use("/spaces", adminSpacesRouter);
adminRouter.use("/holidays", adminHolidaysRouter);
adminRouter.use("/payments", adminPaymentsRouter);
adminRouter.use("/billing", adminBillingRouter);
adminRouter.use("/communications", adminCommunicationsRouter);
adminRouter.use("/notifications", adminNotificationsRouter);
adminRouter.use("/audit", adminAuditRouter);
adminRouter.use("/reports", adminReportsRouter);
adminRouter.use("/settings", adminSettingsRouter);
adminRouter.use("/users", requireRole("SUPER_ADMIN"), adminUsersRouter);
