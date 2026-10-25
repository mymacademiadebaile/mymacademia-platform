import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import { AppError } from "../../common/http/app-error";
import { StudentModel } from "../students/student.model";
import { ContactModel } from "./contact.model";

// Locks never store the document number itself.
export const dniLockKey = (dni: string) => `identity:dni:${createHash("sha256").update(dni).digest("hex")}`;
export async function assertDniAvailable(organizationId: string, dni: string | undefined, exceptId: string | undefined, session: ClientSession) {
  if (!dni) return;
  const filter = { organizationId, dni, ...(exceptId ? { _id: { $ne: exceptId } } : {}) };
  const [contact, student] = await Promise.all([
    ContactModel.exists(filter).session(session), StudentModel.exists(filter).session(session)
  ]);
  if (contact || student) throw new AppError(409, "Ese DNI ya pertenece a otra persona. Buscala y reutilizá su ficha.", "DNI_ALREADY_EXISTS");
}
