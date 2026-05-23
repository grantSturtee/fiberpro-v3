"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPageTemplate, type PageTemplateActionState } from "./actions";

const initial: PageTemplateActionState = { error: null };

const TYPE_LABELS: Record<string, string> = {
  cover: "Cover",
  tcp_wrapper: "TCP Wrapper",
  tcd_wrapper: "TCD Wrapper",
  sld_wrapper: "SLD Wrapper",
  application_form: "Application Form",
  certification_form: "Certification Form",
  coi: "COI",
};

export function PageTemplateCreateForm() {
  const [state, formAction, pending] = useActionState(createPageTemplate, initial);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2.5">Template created.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. Standard TCP Wrapper v1"
            className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            name="template_type"
            required
            defaultValue=""
            className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="" disabled>— Select type —</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink mb-1">
          PDF File <span className="text-muted font-normal">(optional — can upload later)</span>
        </label>
        <label className="flex items-center gap-3 rounded-lg border border-dashed border-rule bg-canvas px-4 py-3 cursor-pointer hover:border-primary/40 transition-colors">
          <input
            type="file"
            name="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <span className="text-xs text-muted flex-1 min-w-0 truncate">
            {fileName ?? "Click to select a PDF (max 20 MB)"}
          </span>
          <span className="flex-shrink-0 text-xs font-medium text-primary">Browse</span>
        </label>
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          {pending ? "Creating…" : "Create Template"}
        </button>
      </div>
    </form>
  );
}
