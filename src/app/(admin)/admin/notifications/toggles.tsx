"use client";

import * as React from "react";
import { Switch } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { saveAdminNotifyAction } from "../actions";

export function NotifyToggles({ kinds, initial }: { kinds: { key: string; label: string; desc: string; always?: boolean }[]; initial: Record<string, boolean> }) {
  const { push } = useToast();
  const [prefs, setPrefs] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const toggle = (key: string, on: boolean) => {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    start(async () => {
      try {
        await saveAdminNotifyAction(next);
        push({ kind: "success", title: on ? "E-mails on" : "E-mails off", description: kinds.find((k) => k.key === key)?.label });
      } catch (e) {
        setPrefs(prefs); // roll back
        push({ kind: "error", title: "Not saved", description: e instanceof Error ? e.message : String(e) });
      }
    });
  };
  return (
    <ul className="card mt-4 divide-y divide-border">
      {kinds.map((k) => (
        <li key={k.key} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="font-heading font-medium text-ink">{k.label}</p>
            <p className="text-sm text-grey-700">{k.desc}</p>
          </div>
          {k.always ? (
            <span className="shrink-0 rounded-full border border-border bg-grey-100 px-2.5 py-1 font-heading text-xs font-semibold uppercase tracking-wide text-grey-700" title="Every administrator receives these; the setting cannot be changed">Always on</span>
          ) : (
            <Switch checked={prefs[k.key]} onCheckedChange={(v) => toggle(k.key, !!v)} disabled={pending} aria-label={`E-mails for ${k.label}`} />
          )}
        </li>
      ))}
    </ul>
  );
}
