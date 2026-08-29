"use client";

import * as React from "react";
import { DryRunPanel } from "./dry-run-panel";
import { SubmitForm } from "./submit-form";

/** Holds the package a user tested so the submission form below can reuse it without a second file pick. */
export function SubmitWorkspace(props: { contests: { id: string; title: string; remaining: number }[]; preselectContest?: string; maxMb: number; directUpload: boolean }) {
  const [handed, setHanded] = React.useState<File | null>(null);
  return (
    <>
      <DryRunPanel directUpload={props.directUpload} onUse={(f) => setHanded(f)} />
      <SubmitForm {...props} handedFile={handed} />
    </>
  );
}
