import bcrypt from "bcryptjs";
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { OrganizationModel } from "../modules/core/organization.model";
import { BranchModel } from "../modules/core/branch.model";
import { UserModel } from "../modules/auth/user.model";
import { CatalogItemModel } from "../modules/catalogs/catalog.model";
import type { CatalogType } from "@mym/shared";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("es-AR");
}

const DEFAULT_CATALOGS: Array<{
  type: CatalogType;
  values: string[];
}> = [
  {
    type: "DISCIPLINE",
    values: [
      "Reggaetón",
      "Urbano",
      "Hip Hop",
      "Bachata",
      "Salsa",
      "Jazz",
      "Contemporáneo",
      "K-Pop",
      "Heels",
      "Ritmos Latinos",
      "Tango",
      "Folklore"
    ]
  },
  {
    type: "SEGMENT",
    values: ["Infantil", "Adolescentes", "Adultos"]
  },
  {
    type: "LEVEL",
    values: ["Inicial", "Intermedio", "Avanzado"]
  }
];

async function seedCatalogs(organizationId: unknown) {
  let created = 0;
  let updated = 0;

  for (const group of DEFAULT_CATALOGS) {
    for (const [sortOrder, name] of group.values.entries()) {
      const normalizedName = normalizeName(name);

      const result = await CatalogItemModel.updateOne(
        {
          organizationId,
          type: group.type,
          normalizedName
        },
        {
          $set: {
            name,
            isActive: true,
            sortOrder
          },
          $setOnInsert: {
            organizationId,
            type: group.type,
            normalizedName
          }
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        created += 1;
      } else if (result.modifiedCount > 0) {
        updated += 1;
      }
    }
  }

  return { created, updated };
}

async function seed() {
  await connectDatabase();

  const email = (
    process.env.ADMIN_EMAIL?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "mymacademiadebaile@gmail.com"
  ).toLowerCase();
  const password = required("ADMIN_PASSWORD");

  const organization = await OrganizationModel.findOneAndUpdate(
    { slug: "mym-academia" },
    {
      $set: {
        name: "M&M Academia de Baile",
        email,
        timezone: "America/Argentina/Buenos_Aires",
        isActive: true
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const branch = await BranchModel.findOneAndUpdate(
    { organizationId: organization._id, name: "La Plata" },
    {
      $set: {
        address: "Calle 35 entre 3 y 4, La Plata",
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
    existingAdmin.firstName = "Admin";
    existingAdmin.lastName = "M&M";
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
      firstName: "Admin",
      lastName: "M&M",
      role: "ADMIN",
      isActive: true
    });
  }

  const catalogs = await seedCatalogs(organization._id);

  console.log(`Admin ready: ${email}`);
  console.log(`Organization: ${organization.name}`);
  console.log(`Branch: ${branch.name}`);
  console.log(`Catalogs: ${catalogs.created} created, ${catalogs.updated} updated`);
}

seed()
  .then(disconnectDatabase)
  .catch(async (error) => {
    console.error(error);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
