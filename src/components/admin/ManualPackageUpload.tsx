"use client";

import { useActionState, useState, useRef } from "react";
import { uploadManualPackage, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

function UploadForm({
  projectId,
  category,
  label,
  successMessage,
}: {
  projectId: string;
  category: "permit_package" | "application_form";
  label: string;
  successMessage: string;
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    uploadManualPackage,
    { error: null }
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="category" value={category} />

      <p className="text-[11px] font-medium text-muted uppercase tracking-wider">{label}</p>

      {/* File input outside click zone — prevents label re-click propagation after OS picker closes */}
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept=".pdf,application/pdf"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          e.stopPropagation();
          setFileName(e.target.files?.[0]?.name ?? null);
        }}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a PDF file"
        className="flex items-center gap-3 w-full px-3.5 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5"
        style={{
          borderColor: fileName ? "#005bc1" : "#d4dde4",
          background: fileName ? "rgba(0,91,193,0.04)" : undefined,
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current?.click();
          }
        }}
      >
        <div className="flex-1 min-w-0">
          {fileName ? (
            <p className="text-sm text-ink truncate font-medium">{fileName}</p>
          ) : (
            <p className="text-sm text-muted">Choose PDF or drag & drop here</p>
          )}
          <p className="text-xs text-faint mt-0.5">PDF only · max 50 MB</p>
        </div>
        <span className="text-xs font-medium text-primary flex-shrink-0">
          {fileName ? "Change" : "Browse"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          {state.success && <p className="text-xs text-emerald-600">{successMessage}</p>}
        </div>
        <button
          type="submit"
          disabled={pending || !fileName}
          className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white flex-shrink-0 disabled:opacity-50 transition-colors"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}

export function ManualPackageUpload({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="flex-shrink-0 mt-0.5">
          <path d="M7 1.5L12.5 11.5H1.5L7 1.5Z" fill="#fef08a" stroke="#d97706" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M7 5.5v3" stroke="#d97706" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="7" cy="10" r=".6" fill="#d97706" />
        </svg>
        <p className="text-xs text-amber-700">
          No matching permit template — package generation is disabled.
          Upload the permit package manually below.
        </p>
      </div>

      <UploadForm
        projectId={projectId}
        category="permit_package"
        label="Upload Permit Package"
        successMessage="Permit package uploaded."
      />
    </div>
  );
}

export function ApplicationFormUpload({ projectId }: { projectId: string }) {
  return (
    <UploadForm
      projectId={projectId}
      category="application_form"
      label="Upload Application Form"
      successMessage="Application form uploaded."
    />
  );
}
