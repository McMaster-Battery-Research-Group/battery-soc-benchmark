"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleHiddenAction } from "../actions";

export function HideToggle({ id, isHidden }: { id: string; isHidden: boolean }) {
  const [pending, start] = React.useTransition();
  return (
    <Button variant={isHidden ? "secondary" : "outline"} size="sm" loading={pending} onClick={() => start(() => toggleHiddenAction(id, !isHidden))}>
      {isHidden ? <Eye /> : <EyeOff />} {isHidden ? "Hidden" : "Hide"}
    </Button>
  );
}
