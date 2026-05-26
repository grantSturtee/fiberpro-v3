"use client";

import { useState, useRef, useEffect } from "react";
import { useActionState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { uploadManualPackage, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

export type SeparateOutputFile = {
  id: string;
  file_name: string;
  created_at: string;
  source: string | null;
  url: string | null;
};

type OutputCategory = "application_form" | "certification_form" | "coi";

type Props = {
  name: string;
  required: boolean;
  projectId: string;
  category: OutputCategory;
  /** All files for this category, sorted newest-first. files[0] is the active one. */
  files: SeparateOutputFile[];
};

export function SeparateOutputRow({ name, required, projectId, category, files }: Props) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    uploadManualPackage,
    { error: null }
  );

  useEffect(() => {
    // After any completed submission (success OR error) the browser has
    // already cleared the <input type="file"> for security. Sync React state
    // and the ref to match so the Upload button reflects reality on retry.
    if (state.success) {
      setUploadOpen(false);
    }
    if (state.success || state.error) {
      setPickedFileName(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [state]);

  const activeFile = files[0] ?? null;
  const generatedFile = files.find((f) => f.source === "system_generated") ?? null;
  const manualFile = files.find((f) => f.source === "admin_upload") ?? null;

  // Show an alternate source note when both a generated and a manual version exist
  const alternateFile =
    activeFile?.source === "admin_upload" && generatedFile && generatedFile.id !== activeFile.id
      ? generatedFile
      : activeFile?.source === "system_generated" && manualFile && manualFile.id !== activeFile.id
      ? manualFile
      : null;

  const sourceBadge = (() => {
    if (!activeFile) return null;
    if (activeFile.source === "system_generated") {
      return (
        <span className="text-[10px] font-semibold bg-[#F0FDF4] text-[#16A34A] rounded px-1.5 py-0.5">
          Generated
        </span>
      );
    }
    if (activeFile.source === "admin_upload") {
      return (
        <span className="text-[10px] font-semibold bg-[#EFF6FF] text-[#1565C0] rounded px-1.5 py-0.5">
          Uploaded
        </span>
      );
    }
    return null;
  })();

  return (
    <div>
      {/* Main row */}
      <div className="flex items-center gap-2.5 py-2.5">
        {/* Status dot */}
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
            activeFile ? "bg-[#F0FDF4]" : "bg-[#F3F4F6]"
          }`}
        >
          {activeFile ? (
            <CheckCircle2 size={14} strokeWidth={1.5} className="text-[#16A34A]" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-[#D1D5DB] block" />
          )}
        </div>

        {/* Name + required badge */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <p className="text-sm font-medium text-[#111827]">{name}</p>
          {required && (
            <span className="text-[10px] font-semibold text-[#1565C0] bg-[#EFF6FF] rounded px-1.5 py-0.5 flex-shrink-0">
              Required
            </span>
          )}
        </div>

        {/* Right side: source badge + view + upload toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeFile ? sourceBadge : (
            <span className="text-xs text-[#6B7280]">Not on file</span>
          )}

          {activeFile?.url && (
            <a
              href={activeFile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#1565C0] hover:underline"
            >
              View
            </a>
          )}

          {/* Upload toggle button */}
          <button
            type="button"
            onClick={() => {
              setUploadOpen((v) => !v);
              setPickedFileName(null);
            }}
            title={uploadOpen ? "Cancel upload" : `Upload ${name}`}
            aria-label={uploadOpen ? "Cancel upload" : `Upload ${name}`}
            className={`p-1 rounded transition-colors ${
              uploadOpen ? "text-[#1565C0]" : "text-[#9CA3AF] hover:text-[#1565C0]"
            }`}
          >
            <Upload size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Alternate source note */}
      {alternateFile && (
        <div className="ml-7 mb-1">
          <p className="text-[11px] text-[#6B7280]">
            Also on file:{" "}
            <span className="font-medium">
              {alternateFile.source === "system_generated" ? "generated" : "uploaded"} version
            </span>
            {alternateFile.url && (
              <>
                {" · "}
                <a
                  href={alternateFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1565C0] hover:underline"
                >
                  View
                </a>
              </>
            )}
            {activeFile?.source === "admin_upload" && alternateFile.source === "system_generated" && (
              <span className="text-[#9CA3AF] ml-1">
                — regenerate package to refresh the generated version
              </span>
            )}
          </p>
        </div>
      )}

      {/* Progressive upload panel */}
      {uploadOpen && (
        <div className="ml-7 mt-1 mb-2 p-3 rounded-lg space-y-2 bg-[#F8F9FB] border border-[#E5E7EB]">
          <form action={formAction} className="space-y-2">
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="category" value={category} />

            <input
              ref={inputRef}
              type="file"
              name="file"
              accept=".pdf,application/pdf"
              tabIndex={-1}
              className="sr-only"
              onChange={(e) => {
                e.stopPropagation();
                setPickedFileName(e.target.files?.[0]?.name ?? null);
              }}
            />

            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a PDF file"
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                pickedFileName
                  ? "border-[#1565C0] bg-[#EFF6FF]"
                  : "border-[#E5E7EB] bg-white hover:border-[#1565C0]/40 hover:bg-[#EFF6FF]"
              }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inputRef.current?.click();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
            >
              <div className="flex-1 min-w-0">
                {pickedFileName ? (
                  <p className="text-sm text-[#111827] truncate font-medium">{pickedFileName}</p>
                ) : (
                  <p className="text-sm text-[#6B7280]">Choose PDF</p>
                )}
                <p className="text-xs text-[#9CA3AF] mt-0.5">PDF only · max 50 MB</p>
              </div>
              <span className="text-xs font-medium text-[#1565C0] flex-shrink-0">
                {pickedFileName ? "Change" : "Browse"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                {state.error && <p className="text-xs text-[#DC2626]">{state.error}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadOpen(false);
                    setPickedFileName(null);
                  }}
                  className="text-xs text-[#6B7280] hover:text-[#111827] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !pickedFileName}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1565C0] hover:bg-[#1251A3] disabled:opacity-50 transition-colors"
                >
                  {pending ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
