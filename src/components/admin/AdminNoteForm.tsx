"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { sendProjectMessage, type MessageActionState } from "@/app/actions/messages";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1.5 w-full px-2 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Saving…" : "Save Note"}
    </button>
  );
}

const initialState: MessageActionState = { error: null };

export function AdminNoteForm({
  projectId,
  revalidatePath,
}: {
  projectId: string;
  revalidatePath: string;
}) {
  const [state, formAction] = useActionState(sendProjectMessage, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="revalidate_path" value={revalidatePath} />
      <textarea
        name="body"
        rows={2}
        required
        className="w-full text-[11px] text-ink bg-card rounded-md px-2 py-1.5 resize-none outline-none"
        style={{ border: "1px solid #d4dde4" }}
        placeholder="Leave a note…"
      />
      <SubmitButton />
      {state.error && (
        <p className="mt-1 text-[10px] text-red-600">{state.error}</p>
      )}
    </form>
  );
}
