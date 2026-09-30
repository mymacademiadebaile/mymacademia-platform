/**
 * Projects internal documents into the public website payload.
 *
 * Pure and database-free on purpose: every public field is listed here explicitly
 * (allow-list), so nothing internal (emails, phones, userId, prices, capacity,
 * billing, students, enrollments) can reach the website by accident. The input types
 * only declare the fields this file is allowed to read.
 */
import { professorPublishIssues, rhythmPublishIssues } from "./publish-rules";

export interface RhythmSource {
  _id: { toString(): string };
  type: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  slug?: string | null;
  tagline?: string | null;
  description?: string | null;
  image?: { url?: string | null; width?: number | null; height?: number | null } | null;
  publishOnWeb?: boolean | null;
}

export interface LevelSource {
  _id: { toString(): string };
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ProfessorSource {
  _id: { toString(): string };
  displayName: string;
  isActive: boolean;
  slug?: string | null;
  bioShort?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  introVideoUrl?: string | null;
  instagram?: string | null;
  disciplineIds?: { toString(): string }[];
  publishOnWeb?: boolean | null;
}

export interface ClassSource {
  _id: { toString(): string };
  name: string;
  status: string;
  publishOnWeb?: boolean | null;
  professorIds: { toString(): string }[];
  disciplineIds: { toString(): string }[];
  levelIds: { toString(): string }[];
  schedules: { day: string; startTime: string; endTime: string }[];
}

export interface PublicImageDto {
  src: string;
  width?: number;
  height?: number;
}

export interface PublicStyleDto {
  slug: string;
  name: string;
  tagline: string;
  /** Paragraphs, split from the long description by blank lines. */
  description: string[];
  image: PublicImageDto;
  levels: string[];
  professorSlugs: string[];
}

export interface PublicProfessorDto {
  slug: string;
  displayName: string;
  firstName: string;
  lastName?: string;
  bioShort: string;
  /** Paragraphs of the full biography (falls back to the short one). */
  bio: string[];
  avatar: PublicImageDto;
  instagram?: string;
  promoVideoUrl?: string;
  /** Slugs of published rhythms. */
  disciplines: string[];
}

export interface PublicScheduleEntryDto {
  slotId: string;
  /** Opaque id that groups the weekly slots of one class. */
  classId: string;
  day: string;
  startTime: string;
  endTime: string;
  className: string;
  /** Primary rhythm (first published one, in catalog order). */
  style: { slug: string; name: string };
  /** All published rhythms of the class, including the primary one. */
  styleSlugs: string[];
  professors: { slug: string; displayName: string }[];
  levels: string[];
}

export interface PublicCatalogDto {
  styles: PublicStyleDto[];
  professors: PublicProfessorDto[];
  schedule: PublicScheduleEntryDto[];
}

export interface PublicCatalogInput {
  rhythms: RhythmSource[];
  levels: LevelSource[];
  professors: ProfessorSource[];
  classes: ClassSource[];
}

const WEEK_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

function paragraphs(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** "@handle", "handle" or an instagram.com URL -> canonical profile URL. Anything else is dropped. */
export function normalizeInstagram(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(cleaned) ? `https://www.instagram.com/${cleaned}` : undefined;
}

function httpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function toImage(image: { url?: string | null; width?: number | null; height?: number | null }): PublicImageDto | undefined {
  const src = httpsUrl(image.url);
  if (!src) return undefined;
  return {
    src,
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {})
  };
}

export function isRhythmPublic(rhythm: RhythmSource): boolean {
  return (
    rhythm.type === "DISCIPLINE" &&
    rhythm.publishOnWeb === true &&
    Boolean(rhythm.slug) &&
    rhythmPublishIssues(rhythm).length === 0
  );
}

export function isProfessorPublic(professor: ProfessorSource): boolean {
  return (
    professor.publishOnWeb === true &&
    Boolean(professor.slug) &&
    professorPublishIssues(professor).length === 0
  );
}

export function buildPublicCatalog(input: PublicCatalogInput): PublicCatalogDto {
  const rhythms = input.rhythms
    .filter(isRhythmPublic)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
  const rhythmById = new Map(rhythms.map((rhythm) => [rhythm._id.toString(), rhythm]));

  const professors = input.professors
    .filter(isProfessorPublic)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  const professorById = new Map(professors.map((professor) => [professor._id.toString(), professor]));

  const levels = input.levels.filter((level) => level.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const levelOrder = new Map(levels.map((level, index) => [level._id.toString(), index]));
  const levelName = new Map(levels.map((level) => [level._id.toString(), level.name]));

  const classes = input.classes.filter((item) => item.status === "ACTIVE" && item.publishOnWeb !== false);

  const schedule: PublicScheduleEntryDto[] = [];
  const levelsByRhythm = new Map<string, Set<string>>();
  const professorsByRhythm = new Map<string, Set<string>>();
  const rhythmsByProfessor = new Map<string, Set<string>>();

  for (const item of classes) {
    const classRhythms = item.disciplineIds
      .map((id) => rhythmById.get(id.toString()))
      .filter((rhythm): rhythm is RhythmSource => Boolean(rhythm))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    // A class that belongs to no published rhythm is not shown.
    if (classRhythms.length === 0) continue;

    const classProfessors = item.professorIds
      .map((id) => professorById.get(id.toString()))
      .filter((professor): professor is ProfessorSource => Boolean(professor));
    const classLevelIds = item.levelIds
      .map((id) => id.toString())
      .filter((id) => levelName.has(id))
      .sort((a, b) => (levelOrder.get(a) ?? 0) - (levelOrder.get(b) ?? 0));
    const classLevels = classLevelIds.map((id) => levelName.get(id)!);
    const primary = classRhythms[0];

    for (const rhythm of classRhythms) {
      const slug = rhythm.slug!;
      const levelSet = levelsByRhythm.get(slug) ?? new Set<string>();
      classLevelIds.forEach((id) => levelSet.add(id));
      levelsByRhythm.set(slug, levelSet);

      const professorSet = professorsByRhythm.get(slug) ?? new Set<string>();
      classProfessors.forEach((professor) => professorSet.add(professor.slug!));
      professorsByRhythm.set(slug, professorSet);

      for (const professor of classProfessors) {
        const set = rhythmsByProfessor.get(professor.slug!) ?? new Set<string>();
        set.add(slug);
        rhythmsByProfessor.set(professor.slug!, set);
      }
    }

    for (const slot of item.schedules) {
      schedule.push({
        slotId: `${item._id.toString()}-${slot.day}-${slot.startTime}`,
        classId: item._id.toString(),
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        className: item.name,
        style: { slug: primary.slug!, name: primary.name },
        styleSlugs: classRhythms.map((rhythm) => rhythm.slug!),
        professors: classProfessors.map((professor) => ({
          slug: professor.slug!,
          displayName: professor.displayName
        })),
        levels: classLevels
      });
    }
  }

  schedule.sort(
    (a, b) =>
      WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime)
  );

  const styles: PublicStyleDto[] = [];
  for (const rhythm of rhythms) {
    const slug = rhythm.slug!;
    const image = toImage(rhythm.image ?? {});
    if (!image) continue;

    const professorSlugs = new Set(professorsByRhythm.get(slug) ?? []);
    for (const professor of professors) {
      if ((professor.disciplineIds ?? []).some((id) => id.toString() === rhythm._id.toString())) {
        professorSlugs.add(professor.slug!);
      }
    }

    styles.push({
      slug,
      name: rhythm.name,
      tagline: rhythm.tagline!.trim(),
      description: paragraphs(rhythm.description),
      image,
      levels: [...(levelsByRhythm.get(slug) ?? [])]
        .sort((a, b) => (levelOrder.get(a) ?? 0) - (levelOrder.get(b) ?? 0))
        .map((id) => levelName.get(id)!),
      professorSlugs: professors.filter((p) => professorSlugs.has(p.slug!)).map((p) => p.slug!)
    });
  }
  const publishedSlugs = new Set(styles.map((style) => style.slug));

  const publicProfessors: PublicProfessorDto[] = [];
  for (const professor of professors) {
    const avatar = toImage({ url: professor.avatarUrl });
    if (!avatar) continue;

    const disciplines = new Set(rhythmsByProfessor.get(professor.slug!) ?? []);
    for (const id of professor.disciplineIds ?? []) {
      const rhythm = rhythmById.get(id.toString());
      if (rhythm) disciplines.add(rhythm.slug!);
    }

    const [firstName, ...rest] = professor.displayName.trim().split(/\s+/);
    const fullBio = paragraphs(professor.bio);
    const instagram = normalizeInstagram(professor.instagram);
    const promoVideoUrl = httpsUrl(professor.introVideoUrl);

    publicProfessors.push({
      slug: professor.slug!,
      displayName: professor.displayName,
      firstName,
      ...(rest.length ? { lastName: rest.join(" ") } : {}),
      bioShort: professor.bioShort!.trim(),
      bio: fullBio.length ? fullBio : [professor.bioShort!.trim()],
      avatar,
      ...(instagram ? { instagram } : {}),
      ...(promoVideoUrl ? { promoVideoUrl } : {}),
      disciplines: [...disciplines].filter((slug) => publishedSlugs.has(slug)).sort()
    });
  }

  return {
    styles,
    professors: publicProfessors,
    // Drop entries whose rhythm lost its image (and so left the styles list).
    schedule: schedule.filter((entry) => publishedSlugs.has(entry.style.slug))
  };
}
