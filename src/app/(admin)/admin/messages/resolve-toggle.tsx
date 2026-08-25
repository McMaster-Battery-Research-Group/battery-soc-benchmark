"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { resolveMessageAction } from "../actions";

export function ResolveToggle({ id, resolved }: { id: string; resolved: boolean }) {
  const [pending, start] = React.useTransition();
  return (
    <Button size="sm" variant={resolved ? "outline" : "secondary"} loading={pending} onClick={() => start(() => resolveMessageAction(id, !resolved))}>
      {resolved ? "Reopen" : "Mark resolved"}
    </Button>
  );
}
