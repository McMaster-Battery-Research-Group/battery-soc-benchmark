"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { respondToInviteAction } from "@/app/(app)/submit/actions";

export function RespondButtons({ token, alreadyAccepted }: { token: string; alreadyAccepted: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const respond = (accept: boolean) =>
    start(async () => {
      const res = await respondToInviteAction({ token }, accept);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: accept ? `You are now listed as a co-author on "${res.modelName}".` : `You declined. ${"The owner has been notified."}` });
      if (accept) setTimeout(() => router.push(`/submissions/${res.submissionId}`), 1200);
    });

  if (msg) return <Alert variant={msg.ok ? "success" : "danger"} className="w-full">{msg.text}</Alert>;
  return (
    <>
      {!alreadyAccepted ? <Button onClick={() => respond(true)} loading={pending} disabled={pending}><Check /> Accept</Button> : null}
      <Button variant="outline" onClick={() => respond(false)} disabled={pending}><X /> {alreadyAccepted ? "Withdraw" : "Decline"}</Button>
    </>
  );
}
