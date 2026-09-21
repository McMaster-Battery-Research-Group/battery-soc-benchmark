"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Neutral silhouette shown when a user has not uploaded a picture. Scales with the circle. */
function PersonGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="size-full" role="presentation" focusable="false">
      <circle cx="16" cy="12" r="5.2" fill="currentColor" />
      <path d="M16 19.4c-5 0-8.6 2.9-9.4 7.2a12 12 0 0 0 18.8 0c-.8-4.3-4.4-7.2-9.4-7.2z" fill="currentColor" />
    </svg>
  );
}

/**
 * Profile picture with a silhouette fallback. Pass `version` (avatarUpdatedAt
 * epoch ms) when known so the browser cache busts after a change; pass
 * `hasAvatar={false}` to skip the request entirely.
 */
export function Avatar({ userId, name, hasAvatar = true, version, size = 32, className }: { userId: string; name: string; hasAvatar?: boolean; version?: number | null; size?: number; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const showImg = hasAvatar && !failed;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", showImg ? "bg-grey-100" : "bg-grey-200 text-grey-500", className)}
      style={{ width: size, height: size }}
      aria-hidden={showImg ? undefined : true}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/users/${userId}/avatar${version ? `?v=${version}` : ""}`} alt={name} width={size} height={size} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <PersonGlyph />
      )}
    </span>
  );
}
