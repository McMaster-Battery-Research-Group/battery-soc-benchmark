"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { contactSchema, zodErrors, type FieldErrors } from "@/lib/validation";

export interface ContactState {
  ok?: boolean;
  errors?: FieldErrors;
  values?: Record<string, string>;
}

export async function sendContactAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const values = Object.fromEntries(["name", "email", "subject", "body"].map((k) => [k, String(fd.get(k) ?? "")]));
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };
  const session = await auth();
  await db.contactMessage.create({ data: { ...parsed.data, userId: session?.user?.id ?? null } });
  return { ok: true };
}
