"use client";

import * as React from "react";

/**
 * True below Tailwind's `sm` breakpoint (phones). False on the server and on the first client render,
 * so markup matches what was streamed; charts re-lay themselves out once the width is known.
 */
export function useNarrow(maxWidth = 639): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);
  return narrow;
}
