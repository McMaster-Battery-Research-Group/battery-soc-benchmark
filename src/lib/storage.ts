import { mkdir, writeFile, unlink, stat, readFile } from "fs/promises";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";

/**
 * Model-package storage.
 *
 *  STORAGE=local  — files under UPLOAD_DIR on this machine (development, or a
 *                   single-server deployment where web + worker share a disk).
 *  STORAGE=blob   — Vercel Blob. The browser uploads directly (see
 *                   /api/upload + submit-form.tsx), the web app stores the blob
 *                   URL as the key, and the worker downloads it wherever it runs
 *                   (e.g. Render). Packages are deleted after evaluation.
 *
 * `materialize(key)` always returns a readable local path for the evaluator.
 */
export interface ModelStorage {
  readonly mode: "local" | "blob";
  put(bytes: Buffer, ext: "zip" | "mat" | "py"): Promise<string>;
  getBytes(key: string): Promise<Buffer>;
  materialize(key: string): Promise<string>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

class LocalStorage implements ModelStorage {
  readonly mode = "local" as const;
  private dir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");

  private p(key: string) {
    return path.join(this.dir, path.basename(key));
  }
  async put(bytes: Buffer, ext: "zip" | "mat" | "py") {
    await mkdir(this.dir, { recursive: true });
    const key = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
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

class BlobStorage implements ModelStorage {
  readonly mode = "blob" as const;
  private token = process.env.BLOB_READ_WRITE_TOKEN;

  async put(bytes: Buffer, ext: "zip" | "mat" | "py") {
    const { put } = await import("@vercel/blob");
    const res = await put(`submissions/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`, bytes, { access: "public", token: this.token, addRandomSuffix: true });
    return res.url;
  }
  async getBytes(key: string) {
    const res = await fetch(key, { cache: "no-store" });
    if (!res.ok) throw new Error(`Package download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async materialize(key: string) {
    const bytes = await this.getBytes(key);
    const dir = path.join(os.tmpdir(), "socbench");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${randomBytes(8).toString("hex")}${path.extname(new URL(key).pathname) || ".zip"}`);
    await writeFile(file, bytes);
    return file;
  }
  async remove(key: string) {
    try {
      const { del } = await import("@vercel/blob");
      await del(key, { token: this.token });
    } catch {}
  }
  async exists(key: string) {
    try {
      const { head } = await import("@vercel/blob");
      await head(key, { token: this.token });
      return true;
    } catch {
      return false;
    }
  }
}

export const storage: ModelStorage = (process.env.STORAGE ?? "local") === "blob" ? new BlobStorage() : new LocalStorage();

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 50) * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ["zip"] as const;
