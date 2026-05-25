"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  uploadSLD,
  deleteSLDFile,
  type AdminActionState,
} from "@/app/(admin)/admin/projects/[id]/actions";

// ── Delete SLD Button ─────────────────────────────────────────────────────────

export function DeleteSLDButton({
  fileId,
  projectId,
  fileName,
}: {
  fileId: string;
  projectId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file_id", fileId);
      fd.append("project_id", projectId);
      const result = await deleteSLDFile({ error: null }, fd);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        title={`Delete ${fileName}`}
        aria-label={`Delete ${fileName}`}
        className="p-1.5 rounded text-[#6B7280] hover:text-[#DC2626] disabled:opacity-50 transition-colors"
      >
        <Trash2 size={14} strokeWidth={1.5} />
      </button>
      {error && (
        <p className="absolute right-0 top-full mt-1 text-xs text-[#DC2626] whitespace-nowrap z-10 bg-white border border-[#E5E7EB] px-2 py-1 rounded">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Upload SLD Form ───────────────────────────────────────────────────────────
// Supports multiple-file selection. Uploads immediately on selection (no button).
// Resets the picker after all files are uploaded so the zone is always ready.

export function UploadSLDForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("project_id", projectId);
        fd.append("file", file);
        const result: AdminActionState = await uploadSLD({ error: null }, fd);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      // Reset input so picker zone is ready for the next selection
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {/* Hidden file input — outside the click zone to prevent label re-click propagation */}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          e.stopPropagation();
          handleFiles(e.target.files);
        }}
      />

      {/* Click zone: div avoids the OS-picker re-click event that <label> re-dispatches */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose PDF files to upload"
        aria-disabled={isPending}
        className={`flex items-center gap-3 w-full px-3.5 py-3 rounded-lg border-2 border-dashed transition-colors ${
          isPending
            ? "border-[#1565C0] bg-[#EFF6FF] cursor-default"
            : "border-[#E5E7EB] cursor-pointer"
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isPending) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isPending) {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current?.click();
          }
        }}
      >
        <div className="flex-1 min-w-0">
          {isPending ? (
            <p className="text-sm text-[#1565C0] font-medium">Uploading…</p>
          ) : (
            <p className="text-sm text-[#6B7280]">Choose PDF(s) to upload</p>
          )}
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            {isPending ? "Please wait" : "PDF only · max 50 MB · multiple files OK"}
          </p>
        </div>
        {!isPending && (
          <span className="text-xs font-medium text-[#1565C0] flex-shrink-0">Browse</span>
        )}
        {isPending && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-[#1565C0] border-t-transparent rounded-full animate-spin flex-shrink-0" aria-hidden />
        )}
      </div>

      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
    </div>
  );
}
