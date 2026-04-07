"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { retryJob, type RetryJobState } from "@/app/(admin)/admin/workflows/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 text-sm rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors"
    >
      {pending ? "Retrying…" : "Retry Job"}
    </button>
  );
}

export function RetryJobButton({ jobId }: { jobId: string }) {
  const [state, action] = useActionState<RetryJobState, FormData>(retryJob, { error: null });

  if (state.success) {
    return (
      <p className="text-sm text-amber-700 font-medium">
        Job re-queued. It will be picked up by n8n on the next poll.
      </p>
    );
  }

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="job_id" value={jobId} />
      <SubmitButton />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
