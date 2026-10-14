"use client";

import { useEffect } from "react";
import { sendGAEvent } from "@next/third-parties/google";

/**
 * Reports interactions to Google Analytics (page views come from the GA tag itself):
 *   link_click       every left-click on a link: internal or external, and the path. Opaque path
 *                    segments (ids, invite tokens) are replaced by ":id"; external links send only
 *                    the host, never the full address.
 *   button_click     clicks on any element carrying data-track="<name>"; the name is all that is sent.
 *   signed_in_visit  once per page load for a signed-in person; carries no identity.
 * Rendered only when a measurement ID is configured, so none of this runs otherwise.
 */
export function AnalyticsEvents({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if (signedIn) sendGAEvent("event", "signed_in_visit");
  }, [signedIn]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const tracked = target.closest<HTMLElement>("[data-track]");
      if (tracked?.dataset.track) sendGAEvent("event", "button_click", { button_name: tracked.dataset.track });

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      let url: URL;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      const internal = url.origin === window.location.origin;
      sendGAEvent("event", "link_click", {
        link_type: internal ? "internal" : "external",
        link_path: internal ? url.pathname.replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, "/:id") : url.hostname,
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
