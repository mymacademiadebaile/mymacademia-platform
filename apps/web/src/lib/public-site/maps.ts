import type { Branch } from "./types";

export function mapsSearchUrl(branch: Branch): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.mapsQuery)}`;
}

export function mapsDirectionsUrl(branch: Branch): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(branch.mapsQuery)}`;
}

/** Key-less embed. Swap for a Place ID embed once the pin is verified. */
export function mapsEmbedUrl(branch: Branch): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(branch.mapsQuery)}&z=16&output=embed`;
}

export function fullAddress(branch: Branch): string {
  return `${branch.streetAddress}, ${branch.betweenStreets}, ${branch.locality}, ${branch.region}`;
}
