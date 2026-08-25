import { db } from "@/lib/db";

/** Serves a user's profile picture (stored as a small JPEG in the database). 404 when none is set. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, select: { avatar: true, avatarType: true, avatarUpdatedAt: true } });
  if (!u?.avatar) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  const etag = `"${u.avatarUpdatedAt?.getTime() ?? 0}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
  return new Response(Buffer.from(u.avatar), {
    headers: {
      "Content-Type": u.avatarType ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      ETag: etag,
    },
  });
}
