/**
 * One-off: create the private Supabase Storage bucket for submission packages.
 *   STORAGE=supabase SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npx tsx scripts/setup-storage.ts
 * Idempotent — safe to re-run.
 */
import "dotenv/config";
import { SupabaseStorage, MAX_UPLOAD_BYTES } from "@/lib/storage";

async function main() {
  const s = new SupabaseStorage();
  const r = await s.ensureBucket(MAX_UPLOAD_BYTES);
  console.log(`bucket "${s.bucket}": ${r} (private, ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB limit, zip only)`);
  // round-trip test
  const key = await s.put(Buffer.from("PKtest"), "zip");
  const ok = (await s.getBytes(key)).length === 10 && (await s.exists(key));
  await s.remove(key);
  console.log(`upload / download / delete: ${ok ? "OK" : "FAILED"}; deleted afterwards: ${!(await s.exists(key))}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
