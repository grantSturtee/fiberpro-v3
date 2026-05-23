"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  uploadIntakeFile,
  type CompanyFileActionState,
} from "@/app/(company)/company/projects/[id]/actions";
import { INTAKE_ACCEPT_ATTR } from "@/lib/constants/files";

const initialState: CompanyFileActionState = { error: null };

function UploadZone({
  fileInputRef,
  onSubmit,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
}) {
  const { pending } = useFormStatus();
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file || !fileInputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInputRef.current.files = dt.files;
    onSubmit();
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !pending && fileInputRef.current?.click()}
      role="button"
      tabIndex={pending ? -1 : 0}
      onKeyDown={(e) => e.key === "Enter" && !pending && fileInputRef.current?.click()}
      className={[
        "flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed transition-colors select-none",
        dragging
          ? "border-primary bg-primary-soft"
          : "border-rule hover:border-muted hover:bg-surface",
        pending ? "opacity-60 cursor-default pointer-events-none" : "cursor-pointer",
      ].join(" ")}
    >
      {pending ? (
        <>
          <span className="inline-block w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-xs text-muted">Uploading…</span>
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-shrink-0 text-muted">
            <path d="M8 1v10M4 5l4-4 4 4M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs text-muted">
            {dragging ? "Drop to upload" : "Click to choose or drag & drop a file"}
          </span>
        </>
      )}
    </div>
  );
}

export function UploadIntakeFileForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState(uploadIntakeFile, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  function handleFileChange() {
    if (fileInputRef.current?.files?.length) {
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="project_id" value={projectId} />
      <input
        ref={fileInputRef}
        type="file"
        name="file"
        accept={INTAKE_ACCEPT_ATTR}
        required
        className="sr-only"
        onChange={handleFileChange}
      />
      <UploadZone
        fileInputRef={fileInputRef}
        onSubmit={() => formRef.current?.requestSubmit()}
      />
      {state.error && (
        <p className="mt-2 text-xs text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="mt-2 text-xs text-emerald-700">File uploaded successfully.</p>
      )}
    </form>
  );
}
