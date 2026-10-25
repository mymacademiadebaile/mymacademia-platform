import { z } from "zod";

export function normalizeDni(value: string): string {
  return value.trim().replace(/[.\s-]/g, "").replace(/^0+(?=\d)/, "");
}
export const dniSchema = z.string().max(20).transform(normalizeDni)
  .pipe(z.string().regex(/^\d{6,9}$/, "Ingresá un DNI de 6 a 9 dígitos, sin letras"));
export const optionalDniSchema = z.string().max(20).transform(normalizeDni)
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{6,9}$/, "Ingresá un DNI de 6 a 9 dígitos, sin letras")]))
  .transform((value) => value || undefined).optional();
