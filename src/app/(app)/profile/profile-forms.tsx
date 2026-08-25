"use client";

import * as React from "react";
import { useActionState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { updateProfileAction, changePasswordAction, type ActionState } from "@/app/(auth)/actions";
import { Field, SubmitButton } from "@/components/forms/field";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { Label, FieldError, Hint } from "@/components/ui/input";

export type ProfileValues = {
  id: string;
  name: string;
  affiliation: string;
  email: string;
  role: string;
  occupation: string;
  bio: string;
  website: string;
  linkedin: string;
  orcid: string;
  googleScholar: string;
  researchGate: string;
  github: string;
  hasAvatar: boolean;
  avatarVersion: number | null;
};

const AVATAR_PX = 256;

/** Centre-crop + resize an image file to a square JPEG data URL in the browser. */
async function resizeToDataUrl(file: File): Promise<string> {
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

export function ProfileForms(v: ProfileValues) {
  const [p, pAction] = useActionState<ActionState, FormData>(updateProfileAction, {});
  const [pw, pwAction] = useActionState<ActionState, FormData>(changePasswordAction, {});
  const [preview, setPreview] = React.useState<string | null>(null);
  const [remove, setRemove] = React.useState(false);
  const [picErr, setPicErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    setPicErr(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(f.type)) return setPicErr("Choose a JPEG, PNG or WebP image.");
    if (f.size > 15 * 1024 * 1024) return setPicErr("Image is larger than 15 MB.");
    try {
      setPreview(await resizeToDataUrl(f));
      setRemove(false);
    } catch {
      setPicErr("That image could not be read.");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <form action={pAction} className="card p-6" noValidate>
        <h2 className="font-heading text-lg font-semibold">Public profile</h2>
        <p className="mt-1 text-sm text-grey-700">Shown on your researcher page and next to your public submissions. Everything except name and affiliation is optional.</p>
        {p.ok ? <Alert variant="success" className="mt-4">{p.message}</Alert> : null}
        {p.errors?.form ? <Alert variant="danger" className="mt-4">{p.errors.form}</Alert> : null}

        {/* Picture */}
        <div className="mt-5 flex items-center gap-4">
          <span className="relative">
            {preview && !remove ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="size-20 rounded-full object-cover" />
            ) : (
              <Avatar userId={v.id} name={v.name} hasAvatar={v.hasAvatar && !remove} version={v.avatarVersion} size={80} />
            )}
          </span>
          <div className="space-y-1.5">
            <Label htmlFor="f-avatar">Profile picture</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Camera /> {v.hasAvatar || preview ? "Change picture" : "Upload picture"}</Button>
              {(v.hasAvatar || preview) && !remove ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setRemove(true); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}><Trash2 /> Remove</Button>
              ) : null}
            </div>
            <Hint>Square crop, resized to {AVATAR_PX}×{AVATAR_PX} px before upload. JPEG, PNG or WebP.</Hint>
            <FieldError>{picErr ?? p.errors?.avatar}</FieldError>
            <input ref={fileRef} id="f-avatar" type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            <input type="hidden" name="avatarData" value={preview && !remove ? preview : ""} />
            <input type="checkbox" name="removeAvatar" checked={remove} readOnly className="hidden" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" name="name" defaultValue={v.name} required error={p.errors?.name} autoComplete="name" />
          <Field label="Affiliation" name="affiliation" defaultValue={v.affiliation} required error={p.errors?.affiliation} autoComplete="organization" placeholder="e.g. McMaster University" />
          <Field label="Position / occupation" name="occupation" defaultValue={v.occupation} error={p.errors?.occupation} placeholder="e.g. PhD candidate, BMS engineer" autoComplete="organization-title" />
          <div>
            <p className="mb-1.5 font-heading text-sm font-medium text-grey-800">Email</p>
            <p className="flex items-center gap-2 text-sm text-grey-900">{v.email} <Badge variant={v.role === "ADMIN" ? "maroon" : "neutral"}>{v.role === "ADMIN" ? "Administrator" : "Verified"}</Badge></p>
            <Hint>Never shown publicly.</Hint>
          </div>
        </div>
        <div className="mt-4">
          <Field label="Short bio" name="bio" textarea rows={3} defaultValue={v.bio} error={p.errors?.bio} placeholder="Research interests, lab, what you work on…" hint="Up to 600 characters." />
        </div>

        <h3 className="mt-6 font-heading text-sm font-semibold uppercase tracking-wide text-grey-700">Links & research IDs</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="ORCID iD" name="orcid" defaultValue={v.orcid} error={p.errors?.orcid} placeholder="0000-0002-1825-0097" inputMode="numeric" />
          <Field label="Google Scholar" name="googleScholar" defaultValue={v.googleScholar} error={p.errors?.googleScholar} placeholder="scholar.google.com/citations?user=…" />
          <Field label="LinkedIn" name="linkedin" defaultValue={v.linkedin} error={p.errors?.linkedin} placeholder="linkedin.com/in/…" />
          <Field label="ResearchGate" name="researchGate" defaultValue={v.researchGate} error={p.errors?.researchGate} placeholder="researchgate.net/profile/…" />
          <Field label="GitHub" name="github" defaultValue={v.github} error={p.errors?.github} placeholder="github.com/…" />
          <Field label="Website" name="website" defaultValue={v.website} error={p.errors?.website} placeholder="https://…" />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <SubmitButton>Save changes</SubmitButton>
          <a href={`/users/${v.id}`} className="text-sm text-maroon underline">View public page</a>
        </div>
      </form>

      <form action={pwAction} className="card h-fit p-6" noValidate>
        <h2 className="font-heading text-lg font-semibold">Change password</h2>
        {pw.ok ? <Alert variant="success" className="mt-4">{pw.message}</Alert> : null}
        {pw.errors?.form ? <Alert variant="danger" className="mt-4">{pw.errors.form}</Alert> : null}
        <div className="mt-5 space-y-4">
          <Field label="Current password" name="current" type="password" autoComplete="current-password" required error={pw.errors?.current} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" required error={pw.errors?.password} hint="At least 8 characters with upper- and lowercase letters and a number." />
        </div>
        <SubmitButton className="mt-6" variant="secondary">Update password</SubmitButton>
      </form>
    </div>
  );
}
