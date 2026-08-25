/**
 * One-off: create the private Supabase Storage bucket for submission packages
 * and verify both upload paths.
 *   STORAGE=supabase SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npx tsx scripts/setup-storage.ts
 * Idempotent — safe to re-run.
 */
import "dotenv/config";
import { SupabaseStorage, MAX_UPLOAD_BYTES } from "@/lib/storage";

async function main() {
  const s = new SupabaseStorage();
  const r = await s.ensureBucket(MAX_UPLOAD_BYTES);
  console.log(`bucket "${s.bucket}": ${r} (private, ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB limit, zip only)`);

  // 1) server-side put / get / exists / remove (examples, worker)
  const payload = Buffer.from("PK setup-storage round-trip");
  const key = await s.put(payload, "zip");
  const back = await s.getBytes(key);
  const ok = back.equals(payload) && (await s.exists(key));
  await s.remove(key);
  console.log(`server upload / download / delete: ${ok ? "OK" : `FAILED (got ${back.length} bytes)`}; deleted afterwards: ${!(await s.exists(key))}`);

  // 2) the browser path — signed upload URL + PUT (what /api/upload + upload-client.ts do)
  const signed = await s.createSignedUpload("dry-runs");
  const put = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": "application/zip", "x-upsert": "false" }, body: new Uint8Array(payload) });
  const ok2 = put.ok && (await s.getBytes(signed.key)).equals(payload);
  await s.remove(signed.key);
  console.log(`signed browser upload: ${ok2 ? "OK" : `FAILED (${put.status} ${await put.text()})`}`);
  if (!ok || !ok2) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
