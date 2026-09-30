/**
 * What a rhythm or a professor needs before it can appear on the public website.
 * The admin API enforces this when publishing and the public projection re-checks it,
 * so removing a photo later can never leave a half-empty card online.
 */

export interface RhythmPublishInput {
  isActive: boolean;
  tagline?: string | null;
  image?: { url?: string | null } | null;
}

export interface ProfessorPublishInput {
  isActive: boolean;
  bioShort?: string | null;
  avatarUrl?: string | null;
}

const filled = (value: string | null | undefined) => Boolean(value && value.trim());

export function rhythmPublishIssues(item: RhythmPublishInput): string[] {
  const issues: string[] = [];
  if (!item.isActive) issues.push("El ritmo está inactivo");
  if (!filled(item.tagline)) issues.push("Falta la descripción corta");
  if (!filled(item.image?.url)) issues.push("Falta la imagen");
  return issues;
}

export function professorPublishIssues(item: ProfessorPublishInput): string[] {
  const issues: string[] = [];
  if (!item.isActive) issues.push("El profesor está inactivo");
  if (!filled(item.bioShort)) issues.push("Falta la descripción corta");
  if (!filled(item.avatarUrl)) issues.push("Falta la foto");
  return issues;
}
