"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 4_000;

/**
 * Render-null component. While `status` is a non-terminal workflow job status
 * (pending / queued / running), polls router.refresh() every 4 s so the page's
 * server components re-fetch fresh data. Stops automatically when the job
 * reaches a terminal state.
 */
export function PackageJobPoller({ status }: { status: string | null | undefined }) {
  const router = useRouter();

  useEffect(() => {
    if (!status || TERMINAL_STATUSES.has(status)) return;

    const id = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [status, router]);

  return null;
}
