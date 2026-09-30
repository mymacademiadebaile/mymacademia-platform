import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import {
  buildPublicCatalog,
  normalizeInstagram,
  type ClassSource,
  type LevelSource,
  type ProfessorSource,
  type RhythmSource
} from "./public-projection";
import { professorPublishIssues, rhythmPublishIssues } from "./publish-rules";

const id = () => new Types.ObjectId();

function rhythm(overrides: Partial<RhythmSource> = {}): RhythmSource {
  return {
    _id: id(),
    type: "DISCIPLINE",
    name: "Bachata Sensual",
    isActive: true,
    sortOrder: 0,
    slug: "bachata-sensual",
    tagline: "Conexión y musicalidad.",
    description: "Primer párrafo.\n\nSegundo párrafo.",
    image: { url: "https://res.cloudinary.com/demo/image/upload/cover.jpg", width: 1000, height: 1500 },
    publishOnWeb: true,
    ...overrides
  };
}

function professor(overrides: Partial<ProfessorSource> = {}): ProfessorSource {
  return {
    _id: id(),
    displayName: "Ana María Pérez",
    isActive: true,
    slug: "ana-maria-perez",
    bioShort: "Bailarina y docente.",
    bio: "Bio larga.\n\nMás bio.",
    avatarUrl: "https://res.cloudinary.com/demo/image/upload/avatar.jpg",
    instagram: "@ana.perez",
    disciplineIds: [],
    publishOnWeb: true,
    ...overrides
  };
}

function danceClass(
  overrides: Partial<ClassSource> & Pick<ClassSource, "disciplineIds" | "professorIds">
): ClassSource {
  return {
    _id: id(),
    name: "Bachata Sensual Inicial",
    status: "ACTIVE",
    publishOnWeb: true,
    levelIds: [],
    schedules: [{ day: "MONDAY", startTime: "19:00", endTime: "20:00" }],
    ...overrides
  };
}

const levels = (names: string[]): LevelSource[] =>
  names.map((name, index) => ({ _id: id(), name, isActive: true, sortOrder: index }));

describe("buildPublicCatalog", () => {
  it("only exposes active and published rhythms that are complete", () => {
    const catalog = buildPublicCatalog({
      rhythms: [
        rhythm(),
        rhythm({ _id: id(), name: "Oculto", slug: "oculto", publishOnWeb: false }),
        rhythm({ _id: id(), name: "Sin foto", slug: "sin-foto", image: null }),
        rhythm({ _id: id(), name: "Inactivo", slug: "inactivo", isActive: false }),
        rhythm({ _id: id(), name: "Sin slug", slug: undefined })
      ],
      levels: [],
      professors: [],
      classes: []
    });

    expect(catalog.styles.map((style) => style.slug)).toEqual(["bachata-sensual"]);
    expect(catalog.styles[0].description).toEqual(["Primer párrafo.", "Segundo párrafo."]);
  });

  it("links classes, professors and levels to each rhythm", () => {
    const sensual = rhythm();
    const zouk = rhythm({ _id: id(), name: "Bachata Zouk", slug: "bachata-zouk", sortOrder: 1 });
    const [inicial, intermedio] = levels(["Inicial", "Intermedio"]);
    const ana = professor();
    const juan = professor({
      _id: id(),
      displayName: "Juan Manrique",
      slug: "juan-manrique",
      disciplineIds: [zouk._id]
    });

    const catalog = buildPublicCatalog({
      rhythms: [zouk, sensual],
      levels: [intermedio, inicial],
      professors: [juan, ana],
      classes: [
        danceClass({
          disciplineIds: [sensual._id],
          professorIds: [ana._id],
          levelIds: [intermedio._id, inicial._id],
          schedules: [
            { day: "WEDNESDAY", startTime: "20:00", endTime: "21:00" },
            { day: "MONDAY", startTime: "19:00", endTime: "20:00" }
          ]
        })
      ]
    });

    // Rhythms follow catalog order; levels follow the level catalog order.
    expect(catalog.styles.map((style) => style.slug)).toEqual(["bachata-sensual", "bachata-zouk"]);
    expect(catalog.styles[0].levels).toEqual(["Inicial", "Intermedio"]);
    expect(catalog.styles[0].professorSlugs).toEqual(["ana-maria-perez"]);
    // A professor is also linked to rhythms they are assigned to without a class.
    expect(catalog.styles[1].professorSlugs).toEqual(["juan-manrique"]);

    expect(catalog.schedule.map((entry) => [entry.day, entry.startTime])).toEqual([
      ["MONDAY", "19:00"],
      ["WEDNESDAY", "20:00"]
    ]);
    expect(catalog.schedule[0].classId).toBe(catalog.schedule[1].classId);
    expect(catalog.schedule[0]).toMatchObject({
      style: { slug: "bachata-sensual", name: "Bachata Sensual" },
      styleSlugs: ["bachata-sensual"],
      professors: [{ slug: "ana-maria-perez", displayName: "Ana María Pérez" }],
      levels: ["Inicial", "Intermedio"]
    });

    const publicAna = catalog.professors.find((item) => item.slug === "ana-maria-perez")!;
    expect(publicAna).toMatchObject({
      firstName: "Ana",
      lastName: "María Pérez",
      bioShort: "Bailarina y docente.",
      bio: ["Bio larga.", "Más bio."],
      instagram: "https://www.instagram.com/ana.perez",
      disciplines: ["bachata-sensual"]
    });
  });

  it("hides classes that are inactive, opted out, or without a published rhythm", () => {
    const sensual = rhythm();
    const hidden = rhythm({ _id: id(), name: "Oculto", slug: "oculto", publishOnWeb: false });
    const ana = professor();

    const catalog = buildPublicCatalog({
      rhythms: [sensual, hidden],
      levels: [],
      professors: [ana],
      classes: [
        danceClass({ disciplineIds: [sensual._id], professorIds: [ana._id] }),
        danceClass({ disciplineIds: [sensual._id], professorIds: [ana._id], status: "INACTIVE" }),
        danceClass({ disciplineIds: [sensual._id], professorIds: [ana._id], publishOnWeb: false }),
        danceClass({ disciplineIds: [hidden._id], professorIds: [ana._id] })
      ]
    });
    expect(catalog.schedule).toHaveLength(1);

    // Classes created before the flag existed (undefined) stay visible.
    const legacy = buildPublicCatalog({
      rhythms: [sensual],
      levels: [],
      professors: [],
      classes: [danceClass({ disciplineIds: [sensual._id], professorIds: [], publishOnWeb: undefined })]
    });
    expect(legacy.schedule).toHaveLength(1);
  });

  it("never names unpublished professors", () => {
    const sensual = rhythm();
    const secret = professor({ _id: id(), displayName: "No Publicado", slug: "no-publicado", publishOnWeb: false });
    const catalog = buildPublicCatalog({
      rhythms: [sensual],
      levels: [],
      professors: [secret],
      classes: [danceClass({ disciplineIds: [sensual._id], professorIds: [secret._id] })]
    });

    expect(catalog.professors).toEqual([]);
    expect(catalog.schedule[0].professors).toEqual([]);
    expect(JSON.stringify(catalog)).not.toContain("No Publicado");
  });

  it("only outputs whitelisted fields, even if the source carries private data", () => {
    const sensual = rhythm();
    const ana = {
      ...professor(),
      phone: "+54 9 221 000-0000",
      userId: id(),
      email: "ana@example.com",
      organizationId: id()
    };
    const classWithPrivateData = {
      ...danceClass({ disciplineIds: [sensual._id], professorIds: [ana._id] }),
      pricePerClass: 9999,
      monthlyPrice: 88888,
      capacity: 17,
      billingMode: "MONTHLY"
    };

    const json = JSON.stringify(
      buildPublicCatalog({ rhythms: [sensual], levels: [], professors: [ana], classes: [classWithPrivateData] })
    );

    for (const secret of [
      "+54 9 221",
      "ana@example.com",
      "userId",
      "organizationId",
      "9999",
      "88888",
      "capacity",
      "billingMode",
      "phone",
      "email"
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it("drops non-https media and malformed instagram handles", () => {
    const catalog = buildPublicCatalog({
      rhythms: [rhythm()],
      levels: [],
      professors: [
        professor({
          introVideoUrl: "http://insecure.example.com/video.mp4",
          instagram: "javascript:alert(1)"
        })
      ],
      classes: []
    });

    expect(catalog.professors[0].promoVideoUrl).toBeUndefined();
    expect(catalog.professors[0].instagram).toBeUndefined();
  });
});

describe("normalizeInstagram", () => {
  it.each([
    ["@mym.academia", "https://www.instagram.com/mym.academia"],
    ["mym.academia", "https://www.instagram.com/mym.academia"],
    ["https://www.instagram.com/mym.academia/", "https://www.instagram.com/mym.academia"],
    ["javascript:alert(1)", undefined],
    ["", undefined]
  ])("%s", (input, expected) => {
    expect(normalizeInstagram(input)).toBe(expected);
  });
});

describe("publish rules", () => {
  it("lists what is missing for a rhythm", () => {
    expect(rhythmPublishIssues({ isActive: true, tagline: "x", image: { url: "https://a/b.jpg" } })).toEqual([]);
    expect(rhythmPublishIssues({ isActive: false, tagline: " ", image: null })).toHaveLength(3);
  });

  it("lists what is missing for a professor", () => {
    expect(professorPublishIssues({ isActive: true, bioShort: "x", avatarUrl: "https://a/b.jpg" })).toEqual([]);
    expect(professorPublishIssues({ isActive: true, bioShort: "", avatarUrl: "" })).toHaveLength(2);
  });
});
