import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { fmtDate } from "@/lib/utils";
import { MODEL_TYPE_LABELS } from "@/lib/test-cases";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { RespondButtons } from "./respond";

export const metadata: Metadata = { title: "Co-author invitation" };
export const dynamic = "force-dynamic";

/**
 * Landing page for the Accept / Decline link in the invitation e-mail. The
 * token identifies the invitation; the viewer must be signed in *as the
 * invitee* (the owner is CC'd and holds the same link). The decision is a
 * POST (server action), never a GET — link scanners can't answer for anyone.
 */
export default async function CollabInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?next=${encodeURIComponent(`/collab/${token}`)}`);
  const row = await db.submissionCollaborator.findUnique({
    where: { inviteToken: token },
    include: { user: { select: { id: true, name: true } }, submission: { include: { user: { select: { id: true, name: true, affiliation: true, avatarUpdatedAt: true } } } } },
  });
  // The owner is CC'd on the invitation and therefore has this link — only the invitee may answer.
  if (row && row.user.id !== session.user.id) {
    return (
      <div className="container-site py-12">
        <div className="mx-auto max-w-xl">
          <Alert variant="warning" title={`This invitation is addressed to ${row.user.name}`}>
            You are signed in as {session.user.name}. Only {row.user.name} can accept or decline it from their own account.
            {row.submission.user.id === session.user.id ? <> As the owner you can withdraw the invitation from the <Link href={`/submissions/${row.submissionId}`} className="underline">submission page</Link>.</> : null}
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="container-site py-12">
      <div className="mx-auto max-w-xl">
        {!row ? (
          <Alert variant="info" title="This invitation is no longer active">
            It may have been withdrawn by the owner, or you have already answered it. <Link href="/submissions" className="underline">See your submissions</Link>.
          </Alert>
        ) : (
          <div className="card p-6 md:p-8">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.14em] text-maroon">Co-author invitation</p>
            <h1 className="mt-2 font-heading text-2xl font-bold">Hi {row.user.name}, do you want to be listed as a co-author?</h1>
            <div className="mt-5 flex items-center gap-3 rounded-brand border border-border p-3">
              <Avatar userId={row.submission.user.id} name={row.submission.user.name} hasAvatar={!!row.submission.user.avatarUpdatedAt} version={row.submission.user.avatarUpdatedAt?.getTime() ?? null} size={44} />
              <div className="min-w-0">
                <p className="font-heading font-semibold text-ink">{row.submission.modelName}</p>
                <p className="text-sm text-grey-700">{MODEL_TYPE_LABELS[row.submission.modelType]} · by {row.submission.user.name}, {row.submission.user.affiliation} · {fmtDate(row.submission.submittedAt)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-grey-700">Accepting shows your name and picture beside this model on the public leaderboard and on your researcher page. Declining removes you from the submission and notifies {row.submission.user.name}. You can withdraw later from the submission page either way.</p>
            {row.acceptedAt ? <Alert variant="success" className="mt-4">You have already accepted this invitation.</Alert> : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <RespondButtons token={token} alreadyAccepted={!!row.acceptedAt} />
              <Button asChild variant="tertiary"><Link href={`/submissions/${row.submissionId}`}>View the submission first →</Link></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
