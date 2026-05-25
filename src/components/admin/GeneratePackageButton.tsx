"use client";

import { useActionState } from "react";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  enqueuePackageGeneration,
  type EnqueuePackageState,
} from "@/app/(admin)/admin/projects/[id]/actions";
import { CoverTemplatePicker } from "@/components/admin/CoverTemplatePicker";

const initialState: EnqueuePackageState = { error: null };

type CoverTemplate = {
  id: string;
  name: string;
  authority_type: string | null;
  county: string | null;
};

function EnqueueBtn({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1251A3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Queueing…" : "Generate Package"}
    </button>
  );
}

export function GeneratePackageButton({
  projectId,
  canGenerate,
  disabledReason,
  coverTemplates = [],
  compact = false,
  latestCompletedJobId,
  latestJobStatus,
}: {
  projectId: string;
  canGenerate: boolean;
  disabledReason?: string;
  coverTemplates?: CoverTemplate[];
  compact?: boolean;
  /** ID of the latest completed generate_permit_package job. When this matches
   *  the job we just enqueued, the job is done and the waiting banner should clear. */
  latestCompletedJobId?: string | null;
  /** Status of the most recent package job (any status). Used to clear the
   *  waiting banner when the enqueued job has reached a terminal non-completed state. */
  latestJobStatus?: string | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(enqueuePackageGeneration, initialState);

  // Refresh the page's server components once the job is queued so the
  // workflow history, status badges, and package section update immediately.
  const refreshedForJob = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.jobId && state.jobId !== refreshedForJob.current) {
      refreshedForJob.current = state.jobId;
      router.refresh();
    }
  }, [state.jobId, router]);

  // state.jobId is set after enqueue and never resets (useActionState persists client-side).
  // Suppress the waiting banner when the enqueued job is done — either:
  //   a) latestCompletedJobId caught up (job completed successfully), or
  //   b) the latest job reached a terminal non-completed state (failed / cancelled).
  const jobTerminatedWithoutCompletion =
    latestJobStatus === "failed" || latestJobStatus === "cancelled";
  const waitingForJob =
    !!state.jobId &&
    state.jobId !== latestCompletedJobId &&
    !jobTerminatedWithoutCompletion;

  if (waitingForJob) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#D97706]">
        <span className="inline-block w-2 h-2 rounded-full bg-[#D97706]" />
        Job queued — waiting for n8n pickup.
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-1">
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="project_id" value={projectId} />
          <CoverTemplatePicker templates={coverTemplates} compact />
          <EnqueueBtn disabled={!canGenerate} />
        </form>
        {state.error && (
          <p className="text-xs text-[#DC2626] text-right">{state.error}</p>
        )}
        {state.warnings && state.warnings.map((w, i) => (
          <p key={i} className="text-xs text-[#D97706] text-right">{w}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="project_id" value={projectId} />
        <CoverTemplatePicker templates={coverTemplates} />
        <div className="flex items-center justify-between gap-4">
          {disabledReason && !canGenerate && (
            <p className="text-xs text-[#6B7280]">{disabledReason}</p>
          )}
          <EnqueueBtn disabled={!canGenerate} />
        </div>
      </form>
      {state.error && (
        <p className="text-xs text-[#DC2626]">{state.error}</p>
      )}
      {state.warnings && (
        <div className="space-y-1">
          {state.warnings.map((w, i) => (
            <p key={i} className="text-xs text-[#D97706]">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
