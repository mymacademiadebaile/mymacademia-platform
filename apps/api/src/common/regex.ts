/** Escapes user input so it is matched literally inside a MongoDB $regex. */
export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive "contains" filter for a free-text search term. */
export function containsText(value: string) {
  return { $regex: escapeRegex(value), $options: "i" };
}

/**
 * Matches a stored phone with the same digits regardless of formatting: contacts keep only
 * digits ("2215550122") while students keep what was typed ("221 555-0122").
 */
export function samePhoneDigits(digits: string) {
  const clean = digits.replace(/\D/g, "");
  return { $regex: `^\\D*${clean.split("").join("\\D*")}\\D*$` };
}
