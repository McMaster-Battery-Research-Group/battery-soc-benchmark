"use server";

import { adminNotifyTargets } from "@/lib/admin-notify";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { contactSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { feedbackNotificationEmail } from "@/lib/mail";
import { rateLimit, clientIp, TOO_MANY } from "@/lib/rate-limit";

export interface ContactState {
  ok?: boolean;
  errors?: FieldErrors;
  values?: Record<string, string>;
}

export async function sendContactAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const values = Object.fromEntries(["name", "email", "category", "subject", "body", "pageUrl"].map((k) => [k, String(fd.get(k) ?? "")]));
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };
  const rl = await rateLimit(`contact:ip:${await clientIp()}`, 5, 60 * 60_000);
  if (!rl.ok) return { errors: { form: TOO_MANY(rl.retryAfterSec) }, values };
  const session = await auth();
  const { pageUrl, ...rest } = parsed.data;
  const msg = await db.contactMessage.create({ data: { ...rest, pageUrl: pageUrl || null, userId: session?.user?.id ?? null } });
  // Notify administrators (best effort). ADMIN_NOTIFY_EMAIL overrides; otherwise every ADMIN account.
  const targets = await adminNotifyTargets();
  await Promise.all(targets.map((to) => feedbackNotificationEmail(to, msg)));
  return { ok: true };
}
