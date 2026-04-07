"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  uploadIntakeFile,
  type CompanyFileActionState,
} from "@/app/(company)/company/projects/[id]/actions";
import { INTAKE_ACCEPT_ATTR } from "@/lib/constants/files";

const initialState: CompanyFileActionState = { error: null };

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60 transition-colors"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? (
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Uploading…
        </span>
      ) : (
        "Upload"
      )}
    </button>
  );
}

export function UploadIntakeFileForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState(uploadIntakeFile, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the file input on successful upload
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-3 flex-wrap">
      <input type="hidden" name="project_id" value={projectId} />
      <input
        type="file"
        name="file"
        accept={INTAKE_ACCEPT_ATTR}
        required
        className="text-xs text-dim file:mr-2 file:px-2.5 file:py-1 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-surface file:text-ink hover:file:bg-[#e3e9ec] transition-colors"
      />
      <UploadButton />
      {state.error && (
        <p className="w-full text-xs text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="w-full text-xs text-emerald-700">File uploaded successfully.</p>
      )}
    </form>
  );
}
