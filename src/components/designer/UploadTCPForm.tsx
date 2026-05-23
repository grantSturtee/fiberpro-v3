"use client";

import { useRef, useState } from "react";
import { uploadTCP } from "@/app/(designer)/designer/projects/[id]/actions";

export function UploadTCPForm({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setPending(true);
    setError(null);
    setSuccess(false);

    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("project_id", projectId);
      fd.set("file", file);
      const result = await uploadTCP({ error: null }, fd);
      if (result.error) {
        setError(result.error);
        setPending(false);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }

    setPending(false);
    setSuccess(true);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        name="files"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white flex-shrink-0 disabled:opacity-60 transition-colors"
        style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
      >
        {pending ? "Uploading…" : "Upload TCP Sheet"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
      {success && <span className="text-xs text-emerald-600">Uploaded successfully.</span>}
    </div>
  );
}
