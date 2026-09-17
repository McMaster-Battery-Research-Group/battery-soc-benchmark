import { mkdir, writeFile, unlink, stat, readFile } from "fs/promises";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";

/**
 * Model-package storage.
 *
 *  STORAGE=local     — files under UPLOAD_DIR on this machine (development, or a
 *                      single-server deployment where web + worker share a disk).
 *  STORAGE=supabase  — a private Supabase Storage bucket (same project as the
 *                      database). The browser uploads directly via a signed
 *                      upload URL from /api/upload (Vercel caps request bodies at
 *                      ~4.5 MB), the web app stores the object key, and the worker
 *                      downloads it with the service key wherever it runs.
 *                      Packages are deleted after evaluation.
 *  STORAGE=remote    — worker only, paired with a STORAGE=local web host on
 *                      another machine: files stay on the web host's disk and the
 *                      worker reads and writes them through /api/internal/storage
 *                      with STORAGE_REMOTE_URL + STORAGE_REMOTE_TOKEN (the same
 *                      token is set on the web host, which enables the endpoint).
 *
 * Keys are opaque strings: a file name for local, an object path such as
 * `submissions/1724600000000-ab12cd.zip` for Supabase. Remote keys are the web host's local keys.
 * `materialize(key)` always returns a readable local path for the evaluator.
 */
export interface ModelStorage {
  readonly mode: "local" | "supabase" | "remote";
  put(bytes: Buffer, ext: "zip" | "mat" | "py"): Promise<string>;
  getBytes(key: string): Promise<Buffer>;
  materialize(key: string): Promise<string>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const newName = (ext: string) => `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;

class LocalStorage implements ModelStorage {
  readonly mode = "local" as const;
  private dir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");

  private p(key: string) {
    return path.join(this.dir, path.basename(key));
  }
  async put(bytes: Buffer, ext: "zip" | "mat" | "py") {
    await mkdir(this.dir, { recursive: true });
    const key = newName(ext);
    await writeFile(this.p(key), bytes);
    return key;
  }
  getBytes(key: string) {
    return readFile(this.p(key));
  }
  async materialize(key: string) {
    return this.p(key);
  }
  async remove(key: string) {
    try {
      await unlink(this.p(key));
    } catch {}
  }
  async exists(key: string) {
    try {
      await stat(this.p(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** Object keys we accept from the browser after a signed upload. */
export const OBJECT_KEY_RE = /^(submissions|dry-runs)\/\d{10,16}-[a-f0-9]{12}\.zip$/;

export class SupabaseStorage implements ModelStorage {
  readonly mode = "supabase" as const;
  private base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "") + "/storage/v1";
  private key = process.env.SUPABASE_SERVICE_KEY ?? "";
  readonly bucket = process.env.SUPABASE_BUCKET ?? "packages";

  /** Validated lazily (on first use), never at import time — `next build` loads route modules without runtime secrets. */
  private headers(extra: Record<string, string> = {}) {
    if (!process.env.SUPABASE_URL || !this.key) throw new Error("STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY set on this host");
    return { Authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }
  private obj(key: string) {
    return `${this.base}/object/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  /** Server-side upload (examples, tests). */
  async put(bytes: Buffer, ext: "zip" | "mat" | "py") {
    const key = `submissions/${newName(ext)}`;
    const res = await fetch(this.obj(key), { method: "POST", headers: this.headers({ "Content-Type": "application/octet-stream", "x-upsert": "false" }), body: new Uint8Array(bytes) });
    if (!res.ok) throw new Error(`Supabase upload failed (${res.status}): ${await res.text()}`);
    return key;
  }

  /** Signed URL the browser PUTs the file to (valid ~2 h). */
  async createSignedUpload(prefix: "submissions" | "dry-runs"): Promise<{ key: string; url: string; token: string }> {
    const key = `${prefix}/${newName("zip")}`;
    const res = await fetch(`${this.base}/object/upload/sign/${this.bucket}/${key}`, { method: "POST", headers: this.headers({ "Content-Type": "application/json" }), body: "{}" });
    if (!res.ok) throw new Error(`Could not create signed upload (${res.status}): ${await res.text()}`);
    const j = (await res.json()) as { url: string; token: string };
    // j.url is relative ("/object/upload/sign/<bucket>/<key>?token=…")
    return { key, url: `${this.base}${j.url}`, token: j.token };
  }

  async getBytes(key: string) {
    const res = await fetch(this.obj(key), { headers: this.headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`Package download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async materialize(key: string) {
    const bytes = await this.getBytes(key);
    const dir = path.join(os.tmpdir(), "socbench");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${randomBytes(8).toString("hex")}${path.extname(key) || ".zip"}`);
    await writeFile(file, bytes);
    return file;
  }
  async remove(key: string) {
    try {
      await fetch(this.obj(key), { method: "DELETE", headers: this.headers() });
    } catch {}
  }
  async exists(key: string) {
    try {
      const res = await fetch(this.obj(key), { method: "HEAD", headers: this.headers() });
      return res.ok;
    } catch {
      return false;
    }
  }
  /** Create the private bucket if it does not exist (idempotent; used by scripts/setup). */
  async ensureBucket(maxBytes: number) {
    const res = await fetch(`${this.base}/bucket`, { method: "POST", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false, file_size_limit: maxBytes, allowed_mime_types: ["application/zip", "application/x-zip-compressed", "application/octet-stream"] }) });
    if (res.ok) return "created";
    const t = await res.text();
    if (res.status === 409 || /already exists/i.test(t)) return "exists";
    throw new Error(`Bucket create failed (${res.status}): ${t}`);
  }
}

/** Worker-side client of a STORAGE=local web host (see src/app/api/internal/storage/route.ts). */
class RemoteStorage implements ModelStorage {
  readonly mode = "remote" as const;
  private url(q: string) {
    const base = (process.env.STORAGE_REMOTE_URL ?? "").replace(/\/$/, "");
    if (!base || !process.env.STORAGE_REMOTE_TOKEN) throw new Error("STORAGE=remote needs STORAGE_REMOTE_URL and STORAGE_REMOTE_TOKEN set on this host");
    return `${base}/api/internal/storage?${q}`;
  }
  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${process.env.STORAGE_REMOTE_TOKEN}`, ...extra };
  }
  async put(bytes: Buffer, ext: "zip" | "mat" | "py") {
    const res = await fetch(this.url(`ext=${ext}`), { method: "POST", headers: this.headers({ "Content-Type": "application/octet-stream" }), body: new Uint8Array(bytes) });
    if (!res.ok) throw new Error(`Remote upload failed (${res.status}): ${await res.text()}`);
    return ((await res.json()) as { key: string }).key;
  }
  async getBytes(key: string) {
    const res = await fetch(this.url(`key=${encodeURIComponent(key)}`), { headers: this.headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`Package download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async materialize(key: string) {
    const bytes = await this.getBytes(key);
    const dir = path.join(os.tmpdir(), "socbench");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${randomBytes(8).toString("hex")}${path.extname(key) || ".zip"}`);
    await writeFile(file, bytes);
    return file;
  }
  async remove(key: string) {
    try {
      await fetch(this.url(`key=${encodeURIComponent(key)}`), { method: "DELETE", headers: this.headers() });
    } catch {}
  }
  async exists(key: string) {
    try {
      return (await fetch(this.url(`key=${encodeURIComponent(key)}`), { method: "HEAD", headers: this.headers() })).ok;
    } catch {
      return false;
    }
  }
}

const mode = process.env.STORAGE ?? "local";
export const storage: ModelStorage = mode === "supabase" ? new SupabaseStorage() : mode === "remote" ? new RemoteStorage() : new LocalStorage();

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 50) * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ["zip"] as const;
