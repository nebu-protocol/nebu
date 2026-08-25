"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal toast: returns [node, show]. Render the node once per page;
 * show(msg) displays it for ~3s. No portal/queue — one message at a time.
 */
export function useToast(): [React.ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);

  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const node = msg ? (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-60 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium whitespace-nowrap text-white shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
    >
      {msg}
    </div>
  ) : null;

  return [node, show];
}
