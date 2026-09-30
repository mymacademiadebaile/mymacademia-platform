/**
 * Schema.org builders. Rules:
 * - Only confirmed facts: no geo, postalCode, openingHours or sameAs until verified.
 * - No Person for placeholder professors, no Event/Course instances for placeholder schedules.
 * - FAQPage only with questions that are visible on the page and confirmed.
 */
import { mapsSearchUrl } from "./maps";
import { SITE, absoluteUrl } from "./site";
import type { Branch, DanceStyle, FaqItem, PublicProfessor } from "./types";

type JsonLd = Record<string, unknown>;

const ORG_ID = `${SITE.url}/#organization`;
const WEBSITE_ID = `${SITE.url}/#website`;

function postalAddress(branch: Branch): JsonLd {
  return {
    "@type": "PostalAddress",
    streetAddress: `${branch.streetAddress}, ${branch.betweenStreets}`,
    addressLocality: branch.locality,
    addressRegion: branch.region,
    addressCountry: branch.countryCode,
    ...(branch.postalCode ? { postalCode: branch.postalCode } : {})
  };
}

export function organizationJsonLd(branch: Branch, styles: DanceStyle[]): JsonLd {
  return {
    "@type": ["EducationalOrganization", "LocalBusiness"],
    "@id": ORG_ID,
    name: SITE.name,
    alternateName: SITE.shortName,
    url: absoluteUrl("/"),
    logo: absoluteUrl(SITE.logo.src),
    // Logo until real photos of the academy exist (stock photos must not describe the business).
    image: absoluteUrl(SITE.logo.src),
    telephone: SITE.whatsapp.e164,
    address: postalAddress(branch),
    hasMap: mapsSearchUrl(branch),
    areaServed: { "@type": "City", name: "La Plata" },
    knowsAbout: styles.map((style) => style.name),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: SITE.whatsapp.e164,
      availableLanguage: "es"
    },
    ...(branch.geo
      ? { geo: { "@type": "GeoCoordinates", latitude: branch.geo.latitude, longitude: branch.geo.longitude } }
      : {}),
    ...(SITE.instagramUrl ? { sameAs: [SITE.instagramUrl] } : {})
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.name,
    url: absoluteUrl("/"),
    inLanguage: "es-AR",
    publisher: { "@id": ORG_ID }
  };
}

export function faqJsonLd(items: FaqItem[]): JsonLd | undefined {
  const confirmed = items.filter((item) => !item.isPlaceholder);
  if (confirmed.length === 0) return undefined;
  return {
    "@type": "FAQPage",
    mainEntity: confirmed.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  };
}

export function personJsonLd(professor: PublicProfessor): JsonLd | undefined {
  if (professor.isPlaceholder) return undefined;
  return {
    "@type": "Person",
    name: professor.displayName,
    jobTitle: "Profesor/a de baile",
    worksFor: { "@id": ORG_ID },
    image: absoluteUrl(professor.avatar.src),
    ...(professor.instagram ? { sameAs: [professor.instagram] } : {})
  };
}

/** Wraps nodes in a single @graph document. */
export function jsonLdGraph(nodes: (JsonLd | undefined)[]): string {
  const graph = nodes.filter((node): node is JsonLd => Boolean(node));
  // Escape "<" so the payload can never close the <script> tag.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}
