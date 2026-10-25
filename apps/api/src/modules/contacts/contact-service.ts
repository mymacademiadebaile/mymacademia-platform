import { Types, type ClientSession } from "mongoose";
import { AppError } from "../../common/http/app-error";
import { StudentModel } from "../students/student.model";
import { ContactModel } from "./contact.model";

/** Additive deterministic bridge: historical Student IDs and every financial reference survive. */
export async function resolveContact(organizationId: string, id: string, dbSession?: ClientSession) {
  const existing = await ContactModel.findOne({ _id: id, organizationId }).session(dbSession ?? null);
  if (existing) return existing;
  const student = await StudentModel.findOne({ _id: id, organizationId }).session(dbSession ?? null);
  if (!student) throw new AppError(404, "Contacto no encontrado", "CONTACT_NOT_FOUND");
  return ContactModel.findOneAndUpdate({ _id: student._id, organizationId }, {
    $setOnInsert: { organizationId, branchId: student.branchId, firstName: student.firstName, lastName: student.lastName,
      email: student.email, phone: student.phone, dni: student.dni, isActive: true, source: { platform: "LEGACY_STUDENT" } }
  }, { upsert: true, new: true, session: dbSession });
}

/** Creates an academic profile only at conversion; the contact and QR keep their original identity. */
export async function ensureAcademicProfile(organizationId: string, contactId: string, dbSession: ClientSession) {
  const contact = await resolveContact(organizationId, contactId, dbSession);
  if (!contact.isActive) throw new AppError(422, "El contacto está inactivo", "CONTACT_INACTIVE");
  const student = await StudentModel.findOneAndUpdate({ _id: contact._id, organizationId }, {
    $set: { isActive: true, contactId: contact._id, ...(contact.dni ? { dni: contact.dni } : {}) },
    $setOnInsert: { organizationId, branchId: contact.branchId, firstName: contact.firstName,
      lastName: contact.lastName, email: contact.email, phone: contact.phone }
  }, { upsert: true, new: true, session: dbSession });
  if (!student.contactId?.equals(new Types.ObjectId(contactId))) throw new AppError(409, "La identidad requiere revisión", "IDENTITY_CONFLICT");
  return student;
}
