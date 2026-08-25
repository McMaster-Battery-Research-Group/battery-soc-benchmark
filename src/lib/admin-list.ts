/**
 * Accounts listed in ADMIN_EMAILS (comma-separated) are administrators:
 * promoted automatically on registration and on sign-in, exempt from the
 * dry-run rate limit, and shown with an Administrator badge. Admins can also be
 * granted/revoked from /admin/users.
 */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const isListedAdmin = (email: string) => adminEmails().has(email.toLowerCase().trim());
