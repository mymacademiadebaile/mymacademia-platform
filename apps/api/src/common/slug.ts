/** URL-safe, accent-free slug: "Bachata Zouk/Souk" -> "bachata-zouk-souk". */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** First free slug among `base`, `base-2`, `base-3`… `isTaken` reads the database. */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>
): Promise<string> {
  const root = slugify(base) || "item";
  let candidate = root;
  for (let suffix = 2; await isTaken(candidate); suffix += 1) {
    candidate = `${root}-${suffix}`;
  }
  return candidate;
}
