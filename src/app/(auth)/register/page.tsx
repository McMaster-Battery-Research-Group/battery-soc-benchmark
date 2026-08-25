import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="card p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold">Create an account</h1>
      <p className="mt-1 text-sm text-grey-700">
        Accounts are free and open to researchers, students and industry. Your name and affiliation are shown on the public leaderboard next to your submissions.
      </p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-grey-700">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-maroon underline">Sign in</Link>
      </p>
    </div>
  );
}
