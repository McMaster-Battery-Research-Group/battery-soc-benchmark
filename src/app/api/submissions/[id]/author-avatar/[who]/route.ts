import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canViewSubmission } from "@/lib/queries";

/**
 * Picture of an author who has no account: `who` is "credit" (the display credit) or a co-author
 * row id. Visible to whoever can see the submission. 404 when there is no picture.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; who: string }> }) {
  const { id, who } = await params;
  const sub = await db.submission.findUnique({ where: { id }, select: { userId: true, isPrivate: true, isHidden: true, creditAvatar: who === "credit", creditAvatarAt: true, collaborators: { select: { userId: true } } } });
  const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  if (!sub) return notFound();
  if (sub.isPrivate || sub.isHidden) {
    const session = await auth();
    if (!canViewSubmission(sub, session?.user)) return notFound();
  }
  let bytes: Uint8Array | null = null, at: Date | null = null;
  if (who === "credit") {
    bytes = sub.creditAvatar ?? null;
    at = sub.creditAvatarAt;
  } else {
    const row = await db.submissionCollaborator.findFirst({ where: { id: who, submissionId: id, userId: null }, select: { avatar: true, avatarAt: true } });
    bytes = row?.avatar ?? null;
    at = row?.avatarAt ?? null;
  }
  if (!bytes) return notFound();
  const etag = `"${at?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": `${sub.isPrivate || sub.isHidden ? "private" : "public"}, max-age=86400, stale-while-revalidate=604800`,
      ETag: etag,
    },
  });
}
