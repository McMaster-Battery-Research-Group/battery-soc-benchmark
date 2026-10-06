"use client";

/** Profile pictures and author photos: the same square JPEG everywhere (server limit 400 KB). */
export const AVATAR_PX = 256;

/** Centre-crop + resize an image file to a square JPEG data URL in the browser. */
export async function resizeAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("unreadable"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const c = document.createElement("canvas");
    c.width = c.height = AVATAR_PX;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    return c.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
