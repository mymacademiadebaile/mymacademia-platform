/**
 * Analytics contract for the public site. No provider is wired yet: events are
 * pushed to `window.dataLayer` when present (GTM / GA4 compatible) and dispatched
 * as a `mym:analytics` DOM event so any future integration can subscribe.
 *
 * Markup declares events declaratively with `data-track="<event>"` (clicks) or
 * `data-track-view="<event>"` (first time the element enters the viewport),
 * plus optional `data-track-label`. See `components/public/analytics-listener.tsx`.
 */

export const PUBLIC_EVENTS = {
  whatsappClick: "whatsapp_click",
  viewStyle: "view_style",
  viewProfessor: "view_professor",
  scheduleView: "schedule_view",
  directionsClick: "directions_click"
} as const;

export type PublicEventName = (typeof PUBLIC_EVENTS)[keyof typeof PUBLIC_EVENTS];

export interface PublicEventPayload {
  label?: string;
  path?: string;
}

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function trackPublicEvent(name: PublicEventName, payload: PublicEventPayload = {}): void {
  if (typeof window === "undefined") return;
  const detail = { event: name, ...payload, path: payload.path ?? window.location.pathname };
  window.dataLayer?.push(detail);
  window.dispatchEvent(new CustomEvent("mym:analytics", { detail }));
  if (process.env.NODE_ENV === "development") console.debug("[analytics]", detail);
}

/** Spread onto any element: `<a {...trackAttrs("whatsapp_click", "hero")}>`. */
export function trackAttrs(name: PublicEventName, label?: string): Record<string, string> {
  return label ? { "data-track": name, "data-track-label": label } : { "data-track": name };
}

export function trackViewAttrs(name: PublicEventName, label?: string): Record<string, string> {
  return label ? { "data-track-view": name, "data-track-label": label } : { "data-track-view": name };
}
