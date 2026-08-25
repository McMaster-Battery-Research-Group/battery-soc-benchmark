"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { AuthError as NextAuthError } from "next-auth";
import { db } from "@/lib/db";
import { hashPassword, signIn, signOut, auth } from "@/lib/auth";
import { isListedAdmin } from "@/lib/admin-list";
import { verificationEmail, passwordResetEmail } from "@/lib/mail";
import { loginSchema, registerSchema, passwordSchema, profileSchema, zodErrors, type FieldErrors } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

export interface ActionState {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  values?: Record<string, string>;
}

const values = (fd: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));

async function issueToken(userId: string, type: "VERIFY_EMAIL" | "RESET_PASSWORD", ttlMs: number) {
  await db.userToken.deleteMany({ where: { userId, type } });
  const token = randomBytes(32).toString("hex");
  await db.userToken.create({ data: { userId, type, token, expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

export async function registerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const vals = values(fd, ["name", "email", "affiliation", "password"]);
  const parsed = registerSchema.safeParse(vals);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values: vals };
  const email = parsed.data.email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { errors: { email: "An account with this email already exists." }, values: vals };

  const user = await db.user.create({
    data: { email, name: parsed.data.name, affiliation: parsed.data.affiliation, passwordHash: await hashPassword(parsed.data.password), role: isListedAdmin(email) ? "ADMIN" : "USER" },
  });
  const token = await issueToken(user.id, "VERIFY_EMAIL", 24 * 3600 * 1000);
  await verificationEmail(user.email, user.name, token);
  redirect(`/verify?sent=1&email=${encodeURIComponent(email)}`);
}

export async function resendVerificationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });
  if (user && !user.emailVerified) {
    const token = await issueToken(user.id, "VERIFY_EMAIL", 24 * 3600 * 1000);
    await verificationEmail(user.email, user.name, token);
  }
  return { ok: true, message: "If that address is registered and unverified, a new verification email has been sent." };
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const vals = values(fd, ["email", "password"]);
  const next = String(fd.get("next") ?? "");
  const parsed = loginSchema.safeParse(vals);
  if (!parsed.success) return { errors: zodErrors(parsed.error), values: { email: vals.email } };
  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
  } catch (err) {
    if (err instanceof NextAuthError) {
      const cause = (err.cause as { err?: Error } | undefined)?.err;
      if (cause?.message === "EMAIL_NOT_VERIFIED") {
        return { errors: { form: "unverified" }, values: { email: vals.email } };
      }
      return { errors: { form: "Incorrect email or password." }, values: { email: vals.email } };
    }
    throw err;
  }
  redirect(next && next.startsWith("/") ? next : "/leaderboard");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function requestResetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").toLowerCase().trim();
  if (!email) return { errors: { email: "Enter your email address" } };
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const token = await issueToken(user.id, "RESET_PASSWORD", 3600 * 1000);
    await passwordResetEmail(user.email, user.name, token);
  }
  return { ok: true, message: "If that address is registered, a password reset link is on its way." };
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) return { errors: { password: pw.error.issues[0]?.message } };
  if (password !== confirm) return { errors: { confirm: "Passwords do not match" } };
  const rec = await db.userToken.findUnique({ where: { token } });
  if (!rec || rec.type !== "RESET_PASSWORD" || rec.expiresAt < new Date()) {
    return { errors: { form: "This reset link is invalid or has expired. Request a new one." } };
  }
  await db.$transaction([
    db.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(password), emailVerified: new Date() } }),
    db.userToken.deleteMany({ where: { userId: rec.userId, type: "RESET_PASSWORD" } }),
  ]);
  redirect("/login?reset=1");
}

export async function updateProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { errors: { form: "Not signed in" } };
  const raw = Object.fromEntries(["name", "affiliation", "occupation", "bio", "website", "linkedin", "googleScholar", "researchGate", "github", "orcid"].map((k) => [k, String(fd.get(k) ?? "")]));
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { errors: zodErrors(parsed.error) };
  const nul = (s?: string) => (s ? s : null);
  const d = parsed.data;
  const data: Prisma.UserUpdateInput = {
    name: d.name,
    affiliation: d.affiliation,
    occupation: nul(d.occupation),
    bio: nul(d.bio),
    website: nul(d.website),
    linkedin: nul(d.linkedin),
    googleScholar: nul(d.googleScholar),
    researchGate: nul(d.researchGate),
    github: nul(d.github),
    orcid: nul(d.orcid),
  };

  // Profile picture: the browser resizes to a ≤256 px JPEG and sends it as a data URL.
  const avatarData = String(fd.get("avatarData") ?? "");
  if (fd.get("removeAvatar") === "on") {
    Object.assign(data, { avatar: null, avatarType: null, avatarUpdatedAt: null });
  } else if (avatarData) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(avatarData);
    if (!m) return { errors: { avatar: "The picture could not be read. Try a JPEG or PNG." } };
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 400 * 1024) return { errors: { avatar: "Picture is too large after resizing. Try a smaller image." } };
    Object.assign(data, { avatar: bytes, avatarType: m[1], avatarUpdatedAt: new Date() });
  }

  await db.user.update({ where: { id: session.user.id }, data });
  revalidatePath("/profile");
  revalidatePath(`/users/${session.user.id}`);
  return { ok: true, message: "Profile updated. Changes to your name appear in the header after your next sign-in." };
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { errors: { form: "Not signed in" } };
  const current = String(fd.get("current") ?? "");
  const password = String(fd.get("password") ?? "");
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) return { errors: { password: pw.error.issues[0]?.message } };
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  const bcrypt = await import("bcryptjs");
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { errors: { current: "Current password is incorrect" } };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  return { ok: true, message: "Password changed." };
}
