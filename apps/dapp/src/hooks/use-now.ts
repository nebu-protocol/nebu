"use client";

import { useSyncExternalStore } from "react";

const subscribeSecond = (onTick: () => void) => {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
};

/**
 * Live formatted clock, e.g. "August 10, 2026, 10:54:52 PM".
 * Empty string during SSR/hydration to avoid clock mismatches.
 */
const subscribeNever = () => () => {};
const clientNow = Date.now();

/**
 * Stable per-load timestamp for time-sampled charts: 0 during SSR/hydration
 * (charts skip the server pass entirely) and a fixed client value after —
 * server and client HTML always agree, so no hydration mismatch.
 */
export function useChartNow(): number {
  return useSyncExternalStore(
    subscribeNever,
    () => clientNow,
    () => 0,
  );
}

export function useNowLabel(): string {
  return useSyncExternalStore(
    subscribeSecond,
    () =>
      new Date().toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
    () => "",
  );
}
