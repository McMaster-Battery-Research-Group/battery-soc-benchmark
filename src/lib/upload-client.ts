"use client";

/**
 * Browser → Supabase Storage direct upload (STORAGE=supabase). Asks the app for
 * a signed upload URL, then PUTs the file there with progress events. Returns
 * the object key the server actions expect in `fileKey`.
 */
export async function uploadPackage(file: File, purpose: "submission" | "dry-run", onProgress?: (pct: number) => void): Promise<string> {
  const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, purpose }) });
  const j = (await res.json()) as { key?: string; url?: string; token?: string; error?: string };
  if (!res.ok || !j.key || !j.url) throw new Error(j.error ?? "Could not start the upload");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", j.url!);
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`)));
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(file);
  });
  return j.key;
}
