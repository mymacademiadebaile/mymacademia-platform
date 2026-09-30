"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { trackPublicEvent, type PublicEventName } from "@/lib/public-site/analytics";

/**
 * One delegated listener for the whole public site, so tracked links can stay
 * server components. Reads `data-track` (click) and `data-track-view` (viewport).
 */
export function AnalyticsListener() {
  const pathname = usePathname();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-track]");
      if (!target) return;
      trackPublicEvent(target.dataset.track as PublicEventName, { label: target.dataset.trackLabel });
    };
    document.addEventListener("click", onClick);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          trackPublicEvent(element.dataset.trackView as PublicEventName, { label: element.dataset.trackLabel });
          observer.unobserve(element);
        }
      },
      { threshold: 0.25 }
    );
    document.querySelectorAll("[data-track-view]").forEach((element) => observer.observe(element));

    return () => {
      document.removeEventListener("click", onClick);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
