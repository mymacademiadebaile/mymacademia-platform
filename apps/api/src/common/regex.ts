/** Escapes user input so it is matched literally inside a MongoDB $regex. */
export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive "contains" filter for a free-text search term. */
export function containsText(value: string) {
  return { $regex: escapeRegex(value), $options: "i" };
}
