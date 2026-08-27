"use server";

import { accountEventEmail } from "@/lib/mail";
import { logEvent } from "@/lib/log";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Second step of e-mail verification. The link in the e-mail only *shows* a
 * confirm button; the account is verified here, on POST. Mail security
 * scanners (Microsoft Safe Links, Gmail, Proofpoint) prefetch every link with
 * a GET, which used to consume the one-time token before the person clicked.
 */
export async function confirmEmailAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const rec = await db.userToken.findUnique({ where: { token }, include: { user: true } });
  if (!rec || rec.type !== "VERIFY_EMAIL") redirect("/verify?invalid=1");
  if (rec.user.emailVerified) redirect("/login?verified=1");
  if (rec.expiresAt < new Date()) redirect("/verify?invalid=1");
  // Verify, but keep the token until it expires so a second visit (or a scanner
  // that fires after the click) lands on "already verified" instead of an error.
  await db.user.update({ where: { id: rec.userId }, data: { emailVerified: new Date() } });
  logEvent("user.verified", { userId: rec.userId });
  accountEventEmail("verified", rec.user, "e-mail link").catch(() => {});
  redirect("/login?verified=1");
}
