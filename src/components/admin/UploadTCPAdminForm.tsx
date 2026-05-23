"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadTCPAdmin, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

export function UploadTCPAdminForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("project_id", projectId);
        fd.append("file", file);
        const result: AdminActionState = await uploadTCPAdmin({ error: null }, fd);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white flex-shrink-0 disabled:opacity-60 transition-colors"
        style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
      >
        {isPending ? "Uploading…" : "Upload TCP Sheet"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
