/**
 * Confirmed public facts about the academy. Everything here is real data;
 * temporary content lives in `mock-data.ts`.
 */

import type { Branch } from "./types";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const SITE = {
  name: "M&M Academia de Baile",
  shortName: "M&M Academia",
  url: siteUrl,
  locale: "es_AR",
  timeZone: "America/Argentina/Buenos_Aires",
  whatsapp: {
    display: "+54 9 221 596-8108",
    e164: "+5492215968108",
    waNumber: "5492215968108"
  },
  defaultWhatsappMessage: "Hola, vi la web de M&M Academia y quisiera consultar por las clases.",
  logo: { src: "/mym-academia-logo.png", width: 160, height: 160 }
} as const;

export function whatsappHref(message: string = SITE.defaultWhatsappMessage): string {
  return `https://wa.me/${SITE.whatsapp.waNumber}?text=${encodeURIComponent(message)}`;
}

export function absoluteUrl(path = "/"): string {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Primary navigation. Hash links resolve from any public page back to the home sections. */
export const PUBLIC_NAV = [
  { label: "Clases", href: "/#estilos" },
  { label: "Profesores", href: "/#profesores" },
  { label: "Horarios", href: "/#horarios" },
  { label: "Academia", href: "/#academia" },
  { label: "Ubicación", href: "/#ubicacion" }
] as const;

/** Confirmed address of the academy. Real data, not a mock. */
export const PRIMARY_BRANCH: Branch = {
  id: "sede-calle-3",
  name: "M&M Academia de Baile",
  streetAddress: "Calle 3 N.º 164",
  betweenStreets: "entre 35 y 36",
  locality: "La Plata",
  region: "Buenos Aires",
  country: "Argentina",
  countryCode: "AR",
  // "entre 35 y 36" confuses Google geocoding; the bare address lands on the right block.
  // Verify the pin on site and switch to a Place ID when the business profile exists.
  mapsQuery: "Calle 3 164, La Plata, Buenos Aires, Argentina"
};

/** Same-origin paths get the site origin; Cloudinary and other absolute URLs are kept. */
export function toAbsoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : absoluteUrl(pathOrUrl);
}
