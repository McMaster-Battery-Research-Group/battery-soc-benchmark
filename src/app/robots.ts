import type { MetadataRoute } from "next";

/**
 * Crawling rules. Signed-in and administrative areas are excluded — they need a session, so a
 * crawler only ever sees a redirect, and indexing them wastes crawl budget on this small site.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://batterysocbenchmark.ca").replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/profile", "/submit", "/collab/", "/verify", "/reset-password", "/forgot-password"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
