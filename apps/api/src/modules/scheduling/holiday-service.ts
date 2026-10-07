import { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";
import { withTransaction } from "../../common/transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { BranchModel } from "../core/branch.model";
import { ClassSessionModel, slotKeyOf } from "../sessions/class-session.model";
import { HolidayModel } from "./holiday.model";
import type { Actor } from "./session-commands";

const holidayReason = (name: string) => `Feriado: ${name}`;

/**
 * Registers a holiday. Regular sessions of that day already generated are suspended (not
 * deleted): they keep identity, roster and charges and can be rescheduled.
 */
export async function createHoliday(actor: Actor, input: { date: string; name: string; branchId?: string }) {
  if (input.branchId && !(await BranchModel.exists({ _id: input.branchId, organizationId: actor.organizationId }))) {
    throw new AppError(422, "La sede no es válida", "INVALID_BRANCH");
  }
  return withTransaction(async (dbSession) => {
    const [holiday] = await HolidayModel.create(
      [{
        organizationId: actor.organizationId,
        branchId: input.branchId ? new Types.ObjectId(input.branchId) : undefined,
        date: input.date,
        name: input.name.trim(),
        createdByUserId: actor.userId
      }],
      { session: dbSession }
    ).catch((error) => {
      if ((error as { code?: number })?.code === 11000) throw new AppError(409, "Ese feriado ya está cargado", "HOLIDAY_EXISTS");
      throw error;
    });

    const sessions = await ClassSessionModel.find({
      organizationId: actor.organizationId,
      sessionDate: input.date,
      origin: "REGULAR",
      status: "SCHEDULED",
      ...(input.branchId ? { branchId: input.branchId } : {})
    }).session(dbSession ?? null);
    for (const session of sessions) {
      session.statusHistory.push({ from: "SCHEDULED", to: "SUSPENDED", reason: holidayReason(holiday.name), userId: new Types.ObjectId(actor.userId), at: new Date() } as never);
      session.status = "SUSPENDED";
      session.statusReason = holidayReason(holiday.name);
      session.slotKey = undefined;
      await session.save({ session: dbSession });
    }

    await AuditLogModel.create(
      [{ organizationId: actor.organizationId, actorUserId: actor.userId, action: "HOLIDAY_CREATED", entityType: "Holiday", entityId: holiday._id, metadata: { ...input, suspendedSessions: sessions.length } }],
      { session: dbSession }
    );
    return { holiday, suspendedSessions: sessions.length };
  });
}

/** Removes a holiday; sessions suspended only because of it are scheduled again. */
export async function deleteHoliday(actor: Actor, holidayId: string) {
  return withTransaction(async (dbSession) => {
    const holiday = await HolidayModel.findOne({ _id: holidayId, organizationId: actor.organizationId }).session(dbSession ?? null);
    if (!holiday) throw new AppError(404, "Feriado no encontrado", "HOLIDAY_NOT_FOUND");
    const sessions = await ClassSessionModel.find({
      organizationId: actor.organizationId,
      sessionDate: holiday.date,
      status: "SUSPENDED",
      statusReason: holidayReason(holiday.name),
      ...(holiday.branchId ? { branchId: holiday.branchId } : {})
    }).session(dbSession ?? null);
    let restored = 0;
    for (const session of sessions) {
      session.statusHistory.push({ from: "SUSPENDED", to: "SCHEDULED", reason: "Feriado eliminado", userId: new Types.ObjectId(actor.userId), at: new Date() } as never);
      session.status = "SCHEDULED";
      session.statusReason = undefined;
      session.slotKey = slotKeyOf(session);
      try {
        await session.save({ session: dbSession });
        restored += 1;
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
      }
    }
    await holiday.deleteOne({ session: dbSession });
    await AuditLogModel.create(
      [{ organizationId: actor.organizationId, actorUserId: actor.userId, action: "HOLIDAY_DELETED", entityType: "Holiday", entityId: holiday._id, metadata: { date: holiday.date, name: holiday.name, restoredSessions: restored } }],
      { session: dbSession }
    );
    return { restoredSessions: restored };
  });
}
