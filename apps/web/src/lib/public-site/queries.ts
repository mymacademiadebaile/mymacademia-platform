/**
 * Data access for the public site. Components and pages only talk to these functions.
 *
 * Today every function resolves mock data. To connect the backend, replace the body
 * with a fetch to the read-only public API (see docs/public-landing.md), keeping the
 * return types. Nothing in the UI needs to change.
 */
import {
  mockBranch,
  mockClasses,
  mockDanceStyles,
  mockFaq,
  mockImages,
  mockProfessors,
  mockSchedule
} from "./mock-data";
import { resolveSchedule, upcomingFromSchedule } from "./schedule-utils";
import { SITE } from "./site";
import type {
  Branch,
  DanceStyle,
  FaqItem,
  PublicProfessor,
  ScheduleEntry,
  UpcomingClass
} from "./types";

// Future: GET /public/styles
export async function fetchPublicDanceStyles(): Promise<DanceStyle[]> {
  return mockDanceStyles;
}

export async function fetchPublicDanceStyle(seoSlug: string): Promise<DanceStyle | undefined> {
  return (await fetchPublicDanceStyles()).find((style) => style.seoSlug === seoSlug);
}

// Future: GET /public/professors
export async function fetchPublicProfessors(): Promise<PublicProfessor[]> {
  return mockProfessors;
}

export async function fetchPublicProfessor(slug: string): Promise<PublicProfessor | undefined> {
  return (await fetchPublicProfessors()).find((professor) => professor.slug === slug);
}

// Future: GET /public/schedule (already resolved server side)
export async function fetchPublicSchedule(): Promise<{ entries: ScheduleEntry[]; isPlaceholder: boolean }> {
  const [styles, professors] = await Promise.all([fetchPublicDanceStyles(), fetchPublicProfessors()]);
  return {
    entries: resolveSchedule(mockSchedule.slots, mockClasses, styles, professors),
    isPlaceholder: mockSchedule.isPlaceholder
  };
}

// Future: GET /public/sessions/upcoming (ClassSession)
export async function fetchUpcomingClasses(limit = 3, now = new Date()): Promise<UpcomingClass[]> {
  const { entries } = await fetchPublicSchedule();
  return upcomingFromSchedule(entries, now, SITE.timeZone, limit);
}

export async function fetchPrimaryBranch(): Promise<Branch> {
  return mockBranch;
}

export async function fetchPublicFaq(): Promise<FaqItem[]> {
  return mockFaq;
}

/** Editorial photos for the home sections. Future: CMS / real photo shoot. */
export async function fetchSiteImages(): Promise<typeof mockImages> {
  return mockImages;
}
