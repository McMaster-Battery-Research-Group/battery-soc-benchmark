import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForms } from "./profile-forms";
import { fmtDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const user = await db.user.findUnique({ where: { id: session!.user.id }, include: { _count: { select: { submissions: true, contestEntries: true } } } });
  if (!user) return null;
  return (
    <>
      <PageHeader eyebrow="Account" title={user.name} description={`${user.affiliation} · member since ${fmtDate(user.createdAt)} · ${user._count.submissions} submissions · ${user._count.contestEntries} contest registrations`} />
      <div className="container-site py-8">
        <ProfileForms name={user.name} affiliation={user.affiliation} email={user.email} role={user.role} />
      </div>
    </>
  );
}
