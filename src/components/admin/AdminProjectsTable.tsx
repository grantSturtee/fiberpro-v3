"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Minus, ChevronsUpDown, X } from "lucide-react";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import {
  computeSubmissionAlert,
  ALERT_SEVERITY_TEXT,
} from "@/lib/alerts/submissionAlerts";
import { formatDate } from "@/lib/utils/format";
import type { ProjectListRow } from "@/lib/queries/projects";
import {
  bulkMarkWaitingOnAuthority,
  bulkMarkInvoiceSent,
  type BulkActionResult,
} from "@/app/(admin)/admin/projects/bulk-actions";

// ── Responsive column layout ──────────────────────────────────────────────────
// Single grid template per breakpoint; optional cells are conditionally
// rendered so hidden cells don't reserve grid slots.
//
//   sm  (default): Checkbox · Job Name · Status                      (3 cols)
//   md  (≥ 768px): + Job Number, Company                             (5 cols)
//   lg  (≥1024px): + Jurisdiction, Designer, Date                    (8 cols)

const GRID_CLASSES = [
  "grid-cols-[40px_minmax(0,2fr)_140px]",
  "md:grid-cols-[40px_110px_minmax(0,2fr)_minmax(0,1fr)_140px]",
  "lg:grid-cols-[40px_110px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_140px_100px]",
].join(" ");

type BulkAction = "submission" | "billing";

const BULK_ACTION_CONFIG: Record<BulkAction, {
  label:        string;
  pendingLabel: string;
  successLabel: string;
  zeroLabel:    string;
}> = {
  submission: {
    label:        "Mark as Waiting on Authority",
    pendingLabel: "Updating…",
    successLabel: "updated",
    zeroLabel:    'must be in "Submitted" status',
  },
  billing: {
    label:        "Mark Invoice Sent",
    pendingLabel: "Updating…",
    successLabel: "invoiced",
    zeroLabel:    'must be in "Draft Invoice" status with an invoice number set',
  },
};

// ── Checkbox (inline) ─────────────────────────────────────────────────────────
// Matches the design.md table-checkbox spec (16x16, 1.5px border #D1D5DB,
// 3px radius, checked bg #1565C0 with white checkmark). Hidden native input
// is overlaid for keyboard / accessibility.

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const filled = checked || indeterminate;

  return (
    <label className="relative inline-flex items-center justify-center cursor-pointer">
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="sr-only"
      />
      <span
        aria-hidden
        className="flex items-center justify-center rounded-[3px] transition-colors"
        style={{
          width: 16,
          height: 16,
          background: filled ? "#1565C0" : "#FFFFFF",
          border: filled ? "1.5px solid #1565C0" : "1.5px solid #D1D5DB",
        }}
      >
        {indeterminate ? (
          <Minus size={10} strokeWidth={3} color="#FFFFFF" />
        ) : checked ? (
          <Check size={10} strokeWidth={3} color="#FFFFFF" />
        ) : null}
      </span>
    </label>
  );
}

// ── Designer avatar (inline) ──────────────────────────────────────────────────
// 28px variant to fit comfortably in the 44px row.

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function DesignerAvatar({ name }: { name: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{
        width: 28,
        height: 28,
        background: "#1565C0",
        color: "#FFFFFF",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

// ── Header cell (visual sort affordance only — no sort behavior yet) ─────────

function HeaderCell({
  label,
  sortable = false,
  align = "left",
}: {
  label: string;
  sortable?: boolean;
  align?: "left" | "right";
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#374151]"
      style={{ justifyContent: align === "right" ? "flex-end" : "flex-start", width: "100%" }}
    >
      {label}
      {sortable && <ChevronsUpDown size={10} strokeWidth={1.5} color="#9CA3AF" />}
    </span>
  );
}

// ── Bulk Action Bar ───────────────────────────────────────────────────────────

function BulkActionBar({
  selected,
  onAction,
  onClear,
  isPending,
  result,
  lastAction,
  onDismissResult,
}: {
  selected:        Set<string>;
  onAction:        (action: BulkAction) => void;
  onClear:         () => void;
  isPending:       boolean;
  result:          BulkActionResult | null;
  lastAction:      BulkAction | null;
  onDismissResult: () => void;
}) {
  if (selected.size === 0) return null;

  return (
    <div
      className="rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap text-white"
      style={{ background: "#1565C0" }}
    >
      <span className="text-[13px] font-semibold flex-shrink-0">
        {selected.size} selected
      </span>

      {(["submission", "billing"] as BulkAction[]).map((action) => {
        const cfg = BULK_ACTION_CONFIG[action];
        const isThisAction = isPending && lastAction === action;
        return (
          <button
            key={action}
            onClick={() => onAction(action)}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-white/20 hover:bg-white/30 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {isThisAction ? cfg.pendingLabel : cfg.label}
          </button>
        );
      })}

      <button
        onClick={onClear}
        disabled={isPending}
        className="text-[12px] text-white/80 hover:text-white transition-colors disabled:opacity-40"
      >
        Clear
      </button>

      {result && lastAction && (
        <div className="flex items-center gap-2 ml-auto min-w-0">
          <span className="text-[12px] font-medium text-white truncate">
            {result.error
              ? result.error
              : result.updated > 0
                ? `${result.updated} ${BULK_ACTION_CONFIG[lastAction].successLabel}${
                    result.skipped.length > 0
                      ? ` · ${result.skipped.length} skipped`
                      : ""
                  }`
                : `0 updated — selected projects ${BULK_ACTION_CONFIG[lastAction].zeroLabel}`}
          </span>
          <button
            onClick={onDismissResult}
            className="text-white/80 hover:text-white hover:bg-white/20 rounded p-0.5 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export function AdminProjectsTable({
  projects,
}: {
  projects: ProjectListRow[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [result, setResult]         = useState<BulkActionResult | null>(null);
  const [lastAction, setLastAction] = useState<BulkAction | null>(null);

  // Clear selection when project list changes (tab nav or refresh).
  // Do NOT clear result — it would wipe the success message immediately
  // after router.refresh() returns.
  useEffect(() => {
    setSelectedIds(new Set());
    setLastAction(null);
  }, [projects]);

  const toggleId = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected  = projects.length > 0 && projects.every((p) => selectedIds.has(p.id));
  const someSelected = !allSelected && projects.some((p) => selectedIds.has(p.id));

  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(projects.map((p) => p.id)));

  const handleAction = (action: BulkAction) => {
    const ids = Array.from(selectedIds);
    setLastAction(action);
    setResult(null);
    startTransition(async () => {
      const res = action === "submission"
        ? await bulkMarkWaitingOnAuthority(ids)
        : await bulkMarkInvoiceSent(ids);
      setResult(res);
      if (!res.error && res.updated > 0) {
        // Partial success: keep only the skipped rows selected so the admin
        // can see exactly which ones didn't apply.
        if (res.skipped.length === 0) {
          setSelectedIds(new Set());
        } else {
          setSelectedIds(new Set(res.skipped.map((s) => s.id)));
        }
        router.refresh();
      }
    });
  };

  if (projects.length === 0) {
    return (
      <div
        className="rounded-lg bg-white border px-6 py-16 text-center"
        style={{ borderColor: "#E5E7EB" }}
      >
        <p className="text-[14px] text-[#6B7280]">No projects in this category.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar — separate floating element above the table */}
      <BulkActionBar
        selected={selectedIds}
        onAction={handleAction}
        onClear={() => { setSelectedIds(new Set()); setResult(null); setLastAction(null); }}
        isPending={isPending}
        result={result}
        lastAction={lastAction}
        onDismissResult={() => setResult(null)}
      />

      {/* Table container */}
      <div
        className="rounded-lg bg-white border overflow-hidden"
        style={{ borderColor: "#E5E7EB" }}
      >
        {/* Header row */}
        <div
          className={`grid gap-4 items-center px-4 ${GRID_CLASSES}`}
          style={{
            background: "#F9FAFB",
            height: 40,
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={toggleAll}
            label={allSelected ? "Deselect all" : "Select all"}
          />
          <div className="hidden md:block">
            <HeaderCell label="Job #" sortable />
          </div>
          <HeaderCell label="Job Name" />
          <div className="hidden lg:block">
            <HeaderCell label="Jurisdiction" sortable />
          </div>
          <div className="hidden md:block">
            <HeaderCell label="Company" sortable />
          </div>
          <div className="hidden lg:block">
            <HeaderCell label="Designer" sortable />
          </div>
          <HeaderCell label="Status" sortable />
          <div className="hidden lg:block">
            <HeaderCell label="Date" sortable align="right" />
          </div>
        </div>

        {/* Data rows */}
        <div>
          {projects.map((p) => {
            const isSelected = selectedIds.has(p.id);
            // NOTE: alert function is still typed on legacy ProjectStatus —
            // see src/lib/alerts/submissionAlerts.ts header comment for why
            // this single site continues to read p.status.
            const alert = computeSubmissionAlert(p.status, p.updated_at);
            const jurisdiction = p.county ? `${p.county} County` : p.authority_type ?? "—";

            return (
              <div
                key={p.id}
                className={[
                  "grid gap-4 items-center px-4 transition-colors",
                  GRID_CLASSES,
                  isSelected ? "bg-[#EFF6FF]" : "hover:bg-[#F9FAFB]",
                ].join(" ")}
                style={{
                  minHeight: 44,
                  borderBottom: "1px solid #F3F4F6",
                }}
              >
                {/* Checkbox — does NOT navigate */}
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleId(p.id)}
                  label={`Select ${p.job_name}`}
                />

                {/* Job # */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="hidden md:block font-mono text-[12px] text-[#6B7280] truncate"
                >
                  {p.job_number}
                </Link>

                {/* Job Name */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="text-[14px] text-[#111827] truncate hover:text-[#1565C0] transition-colors"
                >
                  {p.job_name}
                </Link>

                {/* Jurisdiction */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="hidden lg:block text-[14px] text-[#374151] truncate"
                >
                  {jurisdiction}
                </Link>

                {/* Company */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="hidden md:block text-[14px] text-[#374151] truncate"
                >
                  {p.company_name ?? "—"}
                </Link>

                {/* Designer */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="hidden lg:flex items-center gap-2 min-w-0"
                >
                  {p.assigned_designer_name ? (
                    <>
                      <DesignerAvatar name={p.assigned_designer_name} />
                      <span className="text-[13px] text-[#374151] truncate">
                        {p.assigned_designer_name}
                      </span>
                    </>
                  ) : (
                    <span className="text-[14px] text-[#9CA3AF]">—</span>
                  )}
                </Link>

                {/* Status (+ optional alert tag) */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="flex flex-col items-start justify-center gap-1 min-w-0 py-2"
                >
                  <ProjectStatusBadge status={p.unified_status} />
                  {alert && (
                    <span
                      className={`text-[10px] font-semibold leading-none ${ALERT_SEVERITY_TEXT[alert.severity]}`}
                    >
                      ⚠ {alert.label}
                    </span>
                  )}
                </Link>

                {/* Date — right-aligned */}
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="hidden lg:block text-[12px] text-[#6B7280] text-right"
                >
                  {formatDate(p.created_at)}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
