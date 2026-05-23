"use client";

import { useState } from "react";
import Link from "next/link";
import { setPageTemplateActive } from "./actions";

type PageTemplateRow = {
  id: string;
  name: string;
  template_type: string;
  storage_path: string | null;
  is_active: boolean;
  created_at: string;
};

const TYPE_TOKEN: Record<string, { label: string; classes: string }> = {
  cover:             { label: "Cover", classes: "bg-blue-50 text-blue-700" },
  tcp_wrapper:       { label: "TCP",   classes: "bg-violet-50 text-violet-700" },
  tcd_wrapper:       { label: "TCD",   classes: "bg-indigo-50 text-indigo-700" },
  sld_wrapper:       { label: "SLD",   classes: "bg-cyan-50 text-cyan-700" },
  application_form:  { label: "App",   classes: "bg-emerald-50 text-emerald-700" },
  certification_form:{ label: "Cert",  classes: "bg-amber-50 text-amber-700" },
  coi:               { label: "COI",   classes: "bg-rose-50 text-rose-700" },
};

const TYPE_FILTER_OPTIONS = [
  { value: "",                 label: "All types" },
  { value: "cover",            label: "Cover" },
  { value: "tcp_wrapper",      label: "TCP" },
  { value: "tcd_wrapper",      label: "TCD" },
  { value: "sld_wrapper",      label: "SLD" },
  { value: "application_form", label: "App" },
  { value: "certification_form", label: "Cert" },
  { value: "coi",              label: "COI" },
];

type StatusFilter = "active" | "archived" | "all";

export function TemplateList({ rows }: { rows: PageTemplateRow[] }) {
  const [query,        setQuery]        = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [typeFilter,   setTypeFilter]   = useState("");

  const filtered = rows.filter((r) => {
    if (statusFilter === "active"   && !r.is_active) return false;
    if (statusFilter === "archived" &&  r.is_active) return false;
    if (typeFilter && r.template_type !== typeFilter) return false;
    if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const archivedCount = rows.filter((r) => !r.is_active).length;

  return (
    <div className="space-y-3">
      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search templates…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[160px] rounded-lg border border-rule bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        {/* Status segmented control */}
        <div className="flex rounded-lg border border-rule overflow-hidden text-xs font-medium">
          {(["active", "archived", "all"] as StatusFilter[]).map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 capitalize transition-colors${i > 0 ? " border-l border-rule" : ""} ${
                statusFilter === s
                  ? "bg-ink text-canvas"
                  : "bg-canvas text-dim hover:bg-surface"
              }`}
            >
              {s}{s === "archived" && archivedCount > 0 ? ` (${archivedCount})` : ""}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-rule bg-canvas px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {TYPE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div
          className="bg-card rounded-xl px-6 py-8 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">
            {rows.length === 0
              ? "No templates yet. Create one below."
              : "No templates match your filters."}
          </p>
        </div>
      ) : (
        <div
          className="bg-card rounded-xl overflow-hidden divide-y divide-surface"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          {filtered.map((row) => (
            <TemplateRow key={row.id} row={row} />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-faint text-right">
          {filtered.length} template{filtered.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function TemplateRow({ row }: { row: PageTemplateRow }) {
  const token = TYPE_TOKEN[row.template_type] ?? {
    label: row.template_type,
    classes: "bg-surface text-dim",
  };

  return (
    <div className={`px-4 py-3 flex items-center gap-3${!row.is_active ? " opacity-55" : ""}`}>
      {/* Type token */}
      <span
        className={`flex-shrink-0 w-10 text-center text-[10px] font-bold rounded px-1 py-0.5 ${token.classes}`}
      >
        {token.label}
      </span>

      {/* Name + no-file badge */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-ink truncate">{row.name}</span>
        {!row.storage_path && (
          <span className="flex-shrink-0 text-[10px] font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
            No file
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Link
          href={`/admin/settings/page-templates/${row.id}`}
          className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface transition-colors"
          title="Edit template"
        >
          <PencilIcon />
        </Link>

        <form action={setPageTemplateActive}>
          <input type="hidden" name="id"        value={row.id} />
          <input type="hidden" name="is_active" value={String(!row.is_active)} />
          <button
            type="submit"
            className={`p-1.5 rounded-md transition-colors ${
              row.is_active
                ? "text-muted hover:text-amber-600 hover:bg-amber-50"
                : "text-muted hover:text-emerald-700 hover:bg-emerald-50"
            }`}
            title={row.is_active ? "Archive template" : "Restore template"}
          >
            {row.is_active ? <ArchiveIcon /> : <RestoreIcon />}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.013 2.513a1.75 1.75 0 0 1 2.475 2.474L5.21 13.265l-3.326.738.738-3.326 8.39-8.164Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="3" rx="0.75" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2.5 5.5h11v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-7Z" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M6 9.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 10.5A5 5 0 1 0 4.99 6.5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
      />
      <path d="M2 5.5l3 1-1 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
