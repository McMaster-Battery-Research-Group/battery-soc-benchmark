import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck, MailX } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ResendForm } from "./resend-form";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; sent?: string; email?: string }> }) {
  const sp = await searchParams;

  if (sp.token) {
    const rec = await db.userToken.findUnique({ where: { token: sp.token } });
    if (rec && rec.type === "VERIFY_EMAIL" && rec.expiresAt > new Date()) {
      await db.$transaction([
        db.user.update({ where: { id: rec.userId }, data: { emailVerified: new Date() } }),
        db.userToken.deleteMany({ where: { userId: rec.userId, type: "VERIFY_EMAIL" } }),
      ]);
      redirect("/login?verified=1");
    }
    return (
      <div className="card p-6 text-center md:p-8">
        <MailX className="mx-auto size-12 text-danger" />
        <h1 className="mt-4 font-heading text-2xl font-bold">Link invalid or expired</h1>
        <p className="mt-2 text-sm text-grey-700">Verification links are valid for 24 hours. Enter your email to receive a new one.</p>
        <ResendForm />
      </div>
    );
  }

  return (
    <div className="card p-6 text-center md:p-8">
      <MailCheck className="mx-auto size-12 text-forest" />
      <h1 className="mt-4 font-heading text-2xl font-bold">Check your inbox</h1>
      <p className="mt-2 text-sm text-grey-700">
        {sp.sent ? <>We sent a verification link to <strong className="text-ink">{sp.email}</strong>. </> : null}
        Click the link in the email to activate your account. Didn&apos;t get it? Check your spam folder or request another below.
      </p>
      <ResendForm defaultEmail={sp.email} />
      <Button asChild variant="tertiary" className="mt-6">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
