"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { setRoleAction, verifyUserAction } from "../actions";

export function UserActions({ id, role, verified, isSelf }: { id: string; role: string; verified: boolean; isSelf: boolean }) {
  const [pending, start] = React.useTransition();
  return (
    <div className="flex justify-end gap-2">
      {!verified ? <Button size="sm" variant="outline" loading={pending} onClick={() => start(() => verifyUserAction(id))}>Verify</Button> : null}
      {!isSelf ? (
        <Button size="sm" variant="outline" loading={pending} onClick={() => start(() => setRoleAction(id, role === "ADMIN" ? "USER" : "ADMIN"))}>
          {role === "ADMIN" ? "Revoke admin" : "Make admin"}
        </Button>
      ) : null}
    </div>
  );
}
