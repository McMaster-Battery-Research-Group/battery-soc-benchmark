"use client";

import { sendGAEvent } from "@next/third-parties/google";
import { useEffect } from "react";

export function AuthenticatedEntryTracker() {
  useEffect(() => {
    sendGAEvent("event", "authorized_user_entered_site");
  }, []);

  return null;
}