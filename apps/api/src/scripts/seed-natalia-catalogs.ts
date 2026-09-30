import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { CatalogItemModel } from "../modules/catalogs/catalog.model";
import { OrganizationModel } from "../modules/core/organization.model";

const NATALIA_DISCIPLINES = [
  "Bachata Sensual",
  "Bachata Zouk/Souk",
  "Estilo Femenino"
] as const;

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("es-AR");
}

async function seed() {
  await connectDatabase();

  const organization = await OrganizationModel.findOne({
    slug: "mym-academia"
  });

  if (!organization) {
    throw new Error(
      'Organization "mym-academia" not found. Run the initial seed first.'
    );
  }

  const lastDiscipline = await CatalogItemModel.findOne({
    organizationId: organization._id,
    type: "DISCIPLINE"
  })
    .sort({ sortOrder: -1 })
    .select("sortOrder");

  let nextSortOrder = (lastDiscipline?.sortOrder ?? -1) + 1;
  let created = 0;
  let reactivated = 0;
  let unchanged = 0;

  for (const name of NATALIA_DISCIPLINES) {
    const normalizedName = normalizeName(name);
    const existing = await CatalogItemModel.findOne({
      organizationId: organization._id,
      type: "DISCIPLINE",
      normalizedName
    });

    if (existing) {
      if (!existing.isActive || existing.name !== name) {
        existing.name = name;
        existing.normalizedName = normalizedName;
        existing.isActive = true;
        await existing.save();
        reactivated += 1;
      } else {
        unchanged += 1;
      }
      continue;
    }

    await CatalogItemModel.create({
      organizationId: organization._id,
      type: "DISCIPLINE",
      name,
      normalizedName,
      isActive: true,
      sortOrder: nextSortOrder
    });

    nextSortOrder += 1;
    created += 1;
  }

  console.log("Natalia catalogs ready.");
  console.log("Created:", created);
  console.log("Reactivated/updated:", reactivated);
  console.log("Already present:", unchanged);
  console.log("Disciplines:", NATALIA_DISCIPLINES.join(", "));
}

seed()
  .then(disconnectDatabase)
  .catch(async (error) => {
    console.error(error);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
