import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; verified?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="card p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-grey-700">Access your submissions and evaluate new models.</p>
      {sp.reset ? <Alert variant="success" className="mt-5">Your password has been reset. Sign in with your new password.</Alert> : null}
      {sp.verified ? <Alert variant="success" className="mt-5">Email verified — you can sign in now.</Alert> : null}
      <LoginForm next={sp.next} />
      <p className="mt-6 text-center text-sm text-grey-700">
        New here?{" "}
        <Link href="/register" className="font-medium text-maroon underline">Create an account</Link>
      </p>
    </div>
  );
}
