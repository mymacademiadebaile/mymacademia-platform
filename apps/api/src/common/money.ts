/**
 * Money is stored as integer cents. Pesos only exist at the edges (API input/output and the
 * legacy Payment.amount). Never add or compare floating pesos.
 */
export function toCents(pesos: number) {
  if (!Number.isFinite(pesos)) throw new Error("Invalid amount");
  return Math.round(pesos * 100);
}

export function toPesos(cents: number) {
  return cents / 100;
}

/** Proportional amount, rounded to whole cents (half up). */
export function prorateCents(totalCents: number, part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((totalCents * part) / whole);
}
