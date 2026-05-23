"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { postProjectUpdate, type UpdateActionState } from "@/app/actions/updates";
import { MANUAL_UPDATE_STATUS_OPTIONS } from "@/lib/utils/projectUpdateStatus";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Posting…" : "Post Update"}
    </button>
  );
}

const initialState: UpdateActionState = { error: null };

export function PostUpdateForm({
  projectId,
  revalidatePath,
  stale,
}: {
  projectId: string;
  revalidatePath: string;
  stale?: boolean;
}) {
  const [state, formAction] = useActionState(postProjectUpdate, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2.5">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="revalidate_path" value={revalidatePath} />

      {/* Status — required */}
      <div>
        <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
          Status
        </label>
        <select
          name="status"
          required
          defaultValue=""
          className="w-full text-sm text-ink bg-canvas rounded-lg px-3 py-1.5 outline-none transition-colors"
          style={{ border: "1px solid #d4dde4" }}
        >
          <option value="" disabled>Select status…</option>
          {MANUAL_UPDATE_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Message — optional */}
      <div>
        <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
          Message <span className="text-faint normal-case tracking-normal font-normal">(optional)</span>
        </label>
        <textarea
          name="body"
          rows={2}
          maxLength={2000}
          className="w-full text-sm text-ink bg-surface rounded-lg px-3 py-2 resize-none outline-none"
          style={{ border: "1px solid #d4dde4" }}
          placeholder={stale ? "Share current progress…" : "Add a note…"}
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton />
        {state.error && (
          <p className="text-xs text-red-600">{state.error}</p>
        )}
      </div>
    </form>
  );
}
