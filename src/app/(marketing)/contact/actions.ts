"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { contactSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { feedbackNotificationEmail } from "@/lib/mail";

export interface ContactState {
  ok?: boolean;
  errors?: FieldErrors;
  values?: Record<string, string>;
}

export async function sendContactAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const values = Object.fromEntries(["name", "email", "category", "subject", "body", "pageUrl"].map((k) => [k, String(fd.get(k) ?? "")]));
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };
  const session = await auth();
  const { pageUrl, ...rest } = parsed.data;
  const msg = await db.contactMessage.create({ data: { ...rest, pageUrl: pageUrl || null, userId: session?.user?.id ?? null } });
  // Notify administrators (best effort). ADMIN_NOTIFY_EMAIL overrides; otherwise every ADMIN account.
  const targets = process.env.ADMIN_NOTIFY_EMAIL
    ? process.env.ADMIN_NOTIFY_EMAIL.split(",").map((s) => s.trim()).filter(Boolean)
    : (await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true } })).map((u) => u.email);
  await Promise.all(targets.map((to) => feedbackNotificationEmail(to, msg)));
  return { ok: true };
}
