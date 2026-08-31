import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForms } from "./profile-forms";
import { fmtDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const affiliations = (await db.user.groupBy({ by: ["affiliation"], orderBy: { _count: { affiliation: "desc" } }, take: 100 }).catch(() => [])).map((a) => a.affiliation).filter(Boolean);
  const session = await auth();
  const user = await db.user.findUnique({
    where: { id: session!.user.id },
    select: {
      id: true, name: true, affiliation: true, email: true, role: true, createdAt: true,
      occupation: true, bio: true, website: true, linkedin: true, orcid: true, googleScholar: true, researchGate: true, github: true,
      avatarUpdatedAt: true,
      _count: { select: { submissions: true, contestEntries: true } },
    },
  });
  if (!user) return null;
  return (
    <>
      <PageHeader eyebrow="Account" title={user.name} description={`${user.affiliation} · member since ${fmtDate(user.createdAt)} · ${user._count.submissions} submissions · ${user._count.contestEntries} contest registrations`} />
      <div className="container-site py-8">
        <ProfileForms affiliations={affiliations}
          id={user.id}
          name={user.name}
          affiliation={user.affiliation}
          email={user.email}
          role={user.role}
          occupation={user.occupation ?? ""}
          bio={user.bio ?? ""}
          website={user.website ?? ""}
          linkedin={user.linkedin ?? ""}
          orcid={user.orcid ?? ""}
          googleScholar={user.googleScholar ?? ""}
          researchGate={user.researchGate ?? ""}
          github={user.github ?? ""}
          hasAvatar={!!user.avatarUpdatedAt}
          avatarVersion={user.avatarUpdatedAt?.getTime() ?? null}
        />
      </div>
    </>
  );
}
