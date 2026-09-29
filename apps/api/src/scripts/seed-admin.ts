import bcrypt from "bcryptjs";
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { OrganizationModel } from "../modules/core/organization.model";
import { BranchModel } from "../modules/core/branch.model";
import { UserModel } from "../modules/auth/user.model";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function seed() {
  await connectDatabase();

  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");
  const academyName = process.env.ACADEMY_NAME?.trim() || "M&M Academia de Baile";
  const academySlug = process.env.ACADEMY_SLUG?.trim() || "mym-academia";
  const branchName = process.env.BRANCH_NAME?.trim() || "La Plata";
  const branchAddress = process.env.BRANCH_ADDRESS?.trim() || "Calle 35 entre 3 y 4, La Plata";

  const organization = await OrganizationModel.findOneAndUpdate(
    { slug: academySlug },
    {
      $set: {
        name: academyName,
        email,
        timezone: "America/Argentina/Buenos_Aires",
        isActive: true
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const branch = await BranchModel.findOneAndUpdate(
    { organizationId: organization._id, name: branchName },
    {
      $set: {
        address: branchAddress,
        isActive: true
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const passwordHash = await bcrypt.hash(password, 12);
  const existingAdmin = await UserModel.findOne({
    organizationId: organization._id,
    email
  });

  if (existingAdmin) {
    existingAdmin.firstName = process.env.ADMIN_FIRST_NAME?.trim() || "Admin";
    existingAdmin.lastName = process.env.ADMIN_LAST_NAME?.trim() || "M&M";
    existingAdmin.role = "ADMIN";
    existingAdmin.branchIds = [branch._id];
    existingAdmin.isActive = true;
    existingAdmin.passwordHash = passwordHash;
    await existingAdmin.save();
  } else {
    await UserModel.create({
      organizationId: organization._id,
      branchIds: [branch._id],
      email,
      passwordHash,
      firstName: process.env.ADMIN_FIRST_NAME?.trim() || "Admin",
      lastName: process.env.ADMIN_LAST_NAME?.trim() || "M&M",
      role: "ADMIN",
      isActive: true
    });
  }

  console.log(`Admin ready: ${email}`);
  console.log(`Organization: ${organization.name}`);
  console.log(`Branch: ${branch.name}`);
}

seed()
  .then(disconnectDatabase)
  .catch(async (error) => {
    console.error(error);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
