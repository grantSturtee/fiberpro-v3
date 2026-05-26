"use client";

import { useActionState, useState, useRef } from "react";
import { AlertTriangle } from "lucide-react";
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

      <p className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">{label}</p>

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
        className={`flex items-center gap-3 w-full px-3.5 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
          fileName
            ? "border-[#1565C0] bg-[#EFF6FF]"
            : "border-[#E5E7EB] hover:border-[#1565C0]/40 hover:bg-[#EFF6FF]"
        }`}
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
            <p className="text-sm text-[#111827] truncate font-medium">{fileName}</p>
          ) : (
            <p className="text-sm text-[#6B7280]">Choose PDF or drag & drop here</p>
          )}
          <p className="text-xs text-[#9CA3AF] mt-0.5">PDF only · max 50 MB</p>
        </div>
        <span className="text-xs font-medium text-[#1565C0] flex-shrink-0">
          {fileName ? "Change" : "Browse"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          {state.error && <p className="text-xs text-[#DC2626]">{state.error}</p>}
          {state.success && <p className="text-xs text-[#16A34A]">{successMessage}</p>}
        </div>
        <button
          type="submit"
          disabled={pending || !fileName}
          className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1565C0] hover:bg-[#1251A3] flex-shrink-0 disabled:opacity-50 transition-colors"
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
      <div className="flex items-start gap-3 rounded-lg bg-[#FFFBEB] border border-[#FCD34D] px-4 py-3">
        <AlertTriangle size={13} strokeWidth={1.5} className="text-[#D97706] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#D97706]">
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
