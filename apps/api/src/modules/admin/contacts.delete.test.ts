import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { startReplicaSet } from "../../test/mongo";
import { AuditLogModel } from "../audit/audit-log.model";
import { CheckInCredentialModel } from "../check-in/check-in.models";
import { ContactModel } from "../contacts/contact.model";
import { OpportunityModel } from "../contacts/opportunity.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { StudentModel } from "../students/student.model";
import { TrialBenefitModel } from "../trials/trial-benefit.model";
import { TrialBookingModel } from "../trials/trial-booking.model";

const app = createApp();
let database: Awaited<ReturnType<typeof startReplicaSet>>;
let organizationId: Types.ObjectId;
let branchId: Types.ObjectId;
let userId: Types.ObjectId;
let token: string;

const remove = (id: Types.ObjectId) => request(app)
  .delete(`/api/admin/contacts/${id}`)
  .set("Authorization", `Bearer ${token}`);

beforeAll(async () => {
  database = await startReplicaSet();
  const organization = await OrganizationModel.create({ name: "Test", slug: "contact-delete-test" });
  organizationId = organization._id;
  branchId = (await BranchModel.create({ organizationId, name: "Centro" }))._id;
  userId = new Types.ObjectId();
  token = jwt.sign({ sub: String(userId), organizationId: String(organizationId), role: "ADMIN" }, env.JWT_ACCESS_SECRET);
}, 120000);

afterAll(async () => { await database.stop(); });

describe("DELETE /admin/contacts/:id", () => {
  it("removes a prospect and its prospect-only records, leaving an audit event", async () => {
    const contact = await ContactModel.create({ organizationId, branchId, firstName: "Ana", lastName: "Interesada" });
    const classId = new Types.ObjectId();
    const trialId = new Types.ObjectId();
    await Promise.all([
      OpportunityModel.create({ organizationId, contactId: contact._id, classId }),
      TrialBenefitModel.create({ organizationId, contactId: contact._id, classId }),
      TrialBookingModel.create({ _id: trialId, organizationId, branchId, classId, studentId: contact._id, contactId: contact._id, scheduledFor: new Date() }),
      ClassAttendanceModel.create({ organizationId, sessionId: new Types.ObjectId(), studentId: contact._id, contactId: contact._id, participantType: "TRIAL", trialId }),
      CheckInCredentialModel.create({ organizationId, contactId: contact._id, tokenHash: `hash-${contact._id}`, issuedByUserId: userId })
    ]);

    const response = await remove(contact._id);

    expect(response.status).toBe(204);
    await expect(ContactModel.findById(contact._id)).resolves.toBeNull();
    await expect(OpportunityModel.countDocuments({ contactId: contact._id })).resolves.toBe(0);
    await expect(TrialBenefitModel.countDocuments({ contactId: contact._id })).resolves.toBe(0);
    await expect(TrialBookingModel.countDocuments({ studentId: contact._id })).resolves.toBe(0);
    await expect(ClassAttendanceModel.countDocuments({ studentId: contact._id })).resolves.toBe(0);
    await expect(CheckInCredentialModel.countDocuments({ contactId: contact._id })).resolves.toBe(0);
    expect(await AuditLogModel.findOne({ action: "CONTACT_DELETED", entityId: contact._id })).toMatchObject({
      organizationId,
      actorUserId: userId,
      metadata: expect.objectContaining({ firstName: "Ana", lastName: "Interesada" })
    });
  });

  it("does not allow deleting a contact that already has an academic profile", async () => {
    const contact = await ContactModel.create({ organizationId, branchId, firstName: "Sofía", lastName: "Alumna" });
    await StudentModel.create({ _id: contact._id, contactId: contact._id, organizationId, branchId, firstName: contact.firstName, lastName: contact.lastName });

    const response = await remove(contact._id);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("USE_STUDENT_MANAGEMENT");
    await expect(ContactModel.findById(contact._id)).resolves.not.toBeNull();
  });
});
