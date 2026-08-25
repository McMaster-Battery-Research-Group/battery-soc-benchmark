import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="container-site grid gap-8 py-8 lg:grid-cols-[220px_1fr]">
      <aside>
        <p className="mb-3 font-heading text-xs font-semibold uppercase tracking-[0.14em] text-maroon">Administration</p>
        <AdminNav />
        <p className="mt-6 text-xs text-grey-600">Signed in as an administrator. <Link href="/leaderboard" className="text-maroon underline">Back to site</Link></p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
