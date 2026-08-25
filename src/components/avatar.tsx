"use client";

import * as React from "react";
import { cn, initials } from "@/lib/utils";

/**
 * Profile picture with an initials fallback. Pass `version` (avatarUpdatedAt
 * epoch ms) when known so the browser cache busts after a change; pass
 * `hasAvatar={false}` to skip the request entirely.
 */
export function Avatar({ userId, name, hasAvatar = true, version, size = 32, className }: { userId: string; name: string; hasAvatar?: boolean; version?: number | null; size?: number; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const showImg = hasAvatar && !failed;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-maroon font-heading font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden={showImg ? undefined : true}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/users/${userId}/avatar${version ? `?v=${version}` : ""}`} alt={name} width={size} height={size} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
