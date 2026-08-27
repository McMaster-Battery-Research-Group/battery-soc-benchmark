import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck, MailX, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ResendForm } from "./resend-form";
import { confirmEmailAction } from "./actions";

export const metadata: Metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; sent?: string; email?: string; invalid?: string }> }) {
  const sp = await searchParams;

  if (sp.token) {
    // GET must be side-effect free: e-mail link scanners prefetch it. Show a confirm button instead.
    const rec = await db.userToken.findUnique({ where: { token: sp.token }, include: { user: { select: { email: true, name: true, emailVerified: true } } } });
    const valid = !!rec && rec.type === "VERIFY_EMAIL" && rec.expiresAt > new Date();
    if (rec && rec.type === "VERIFY_EMAIL" && rec.user.emailVerified) {
      return (
        <div className="card p-6 text-center md:p-8">
          <ShieldCheck className="mx-auto size-12 text-forest" />
          <h1 className="mt-4 font-heading text-2xl font-bold">Already verified</h1>
          <p className="mt-2 text-sm text-grey-700"><strong className="text-ink">{rec.user.email}</strong> is confirmed. You can sign in.</p>
          <Button asChild className="mt-6" size="lg"><Link href="/login?verified=1">Sign in</Link></Button>
        </div>
      );
    }
    if (valid) {
      return (
        <div className="card p-6 text-center md:p-8">
          <MailCheck className="mx-auto size-12 text-forest" />
          <h1 className="mt-4 font-heading text-2xl font-bold">Confirm your email</h1>
          <p className="mt-2 text-sm text-grey-700">Hi {rec!.user.name} — press the button to activate <strong className="text-ink">{rec!.user.email}</strong>.</p>
          <form action={confirmEmailAction} className="mt-6">
            <input type="hidden" name="token" value={sp.token} />
            <Button type="submit" size="lg" className="w-full">Confirm my email</Button>
          </form>
          <p className="mt-4 text-xs text-grey-600">This extra click keeps automated e-mail security scanners from activating accounts on your behalf.</p>
        </div>
      );
    }
  }

  if (sp.token || sp.invalid) {
    return (
      <div className="card p-6 text-center md:p-8">
        <MailX className="mx-auto size-12 text-danger" />
        <h1 className="mt-4 font-heading text-2xl font-bold">Link invalid or expired</h1>
        <p className="mt-2 text-sm text-grey-700">Verification links are valid for 24 hours. If you already confirmed, just <Link href="/login" className="text-maroon underline">sign in</Link>; otherwise enter your email to receive a new link.</p>
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
        Click the link in the email, then press <strong>Confirm my email</strong> on the page that opens. Didn&apos;t get it? Check your spam folder or request another below.
      </p>
      <ResendForm defaultEmail={sp.email} />
      <Button asChild variant="tertiary" className="mt-6">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
