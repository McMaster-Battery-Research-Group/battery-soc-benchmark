import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";

/**
 * Issues short-lived client tokens so the browser can upload a submission
 * package straight to Vercel Blob (bypassing the serverless body limit).
 * Only signed-in, verified users get a token; only .zip up to MAX_UPLOAD_MB.
 */
export async function POST(req: Request) {
  if ((process.env.STORAGE ?? "local") !== "blob") return NextResponse.json({ error: "Direct upload disabled" }, { status: 404 });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.toLowerCase().endsWith(".zip")) throw new Error("Only .zip packages are accepted");
        return {
          allowedContentTypes: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      onUploadCompleted: async () => {
        /* the submission row is created by the server action once metadata is posted */
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
