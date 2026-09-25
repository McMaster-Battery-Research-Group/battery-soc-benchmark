"use client";

import { sendGAEvent } from "@next/third-parties/google";
import { useEffect } from "react";

export function LinkClickTracker() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;

      const url = new URL(link.href, window.location.href);
      sendGAEvent("event", "link_click", {
        link_type: url.origin === window.location.origin ? "internal" : "external",
        link_path: url.pathname,
      });
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}