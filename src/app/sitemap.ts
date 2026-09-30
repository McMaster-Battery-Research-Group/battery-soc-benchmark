import type { MetadataRoute } from "next";

import { PEOPLE } from "@/lib/people";
import { EXAMPLES } from "@/lib/examples";

/**
 * The public pages, so search engines index this domain rather than whatever address they
 * happened to crawl first. Only pages that are public and stable are listed: submissions and
 * profiles change constantly and several are private, so they are left to the leaderboard links.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://batterysocbenchmark.ca").replace(/\/$/, "");
  const now = new Date();

  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    page("/", 1, "weekly"),
    page("/leaderboard", 0.9, "daily"),
    page("/getting-started", 0.8, "monthly"),
    page("/dataset", 0.8, "monthly"),
    page("/examples", 0.7, "monthly"),
    page("/docs", 0.7, "monthly"),
    page("/contest", 0.7, "weekly"),
    page("/compare", 0.6, "weekly"),
    page("/about", 0.6, "monthly"),
    page("/help", 0.5, "monthly"),
    page("/glossary", 0.5, "monthly"),
    page("/contact", 0.4, "yearly"),
    page("/privacy", 0.3, "yearly"),
    page("/terms", 0.3, "yearly"),
    page("/accessibility", 0.3, "yearly"),
    ...EXAMPLES.map((e) => page(`/examples#${e.slug}`, 0.4, "monthly")),
    ...PEOPLE.map((p) => page(`/people/${p.slug}`, 0.4, "monthly")),
  ];
}
