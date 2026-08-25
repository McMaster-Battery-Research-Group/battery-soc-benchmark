import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export class UnverifiedEmailError extends Error {}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase().trim();
        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        if (!user.emailVerified) throw new UnverifiedEmailError("EMAIL_NOT_VERIFIED");
        return { id: user.id, email: user.email, name: user.name, role: user.role, affiliation: user.affiliation };
      },
    }),
  ],
});

/** Returns the session user or throws a 401-style error. Use in server actions / route handlers. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError("You must be signed in.", 401);
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AuthError("Administrator access required.", 403);
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
