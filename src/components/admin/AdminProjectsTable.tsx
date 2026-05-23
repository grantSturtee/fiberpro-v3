"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectStatusBadge } from "@/components/ui/StatusBadge";
import {
  computeSubmissionAlert,
  ALERT_SEVERITY_TEXT,
} from "@/lib/alerts/submissionAlerts";
import { formatDate } from "@/lib/utils/format";
import type { ProjectListRow } from "@/lib/queries/projects";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  bulkMarkWaitingOnAuthority,
  bulkMarkInvoiceSent,
  type BulkActionResult,
} from "@/app/(admin)/admin/projects/bulk-actions";

// Column layout: checkbox + 5 data columns.
const COLS = "grid-cols-[1.5rem_2fr_1.5fr_1fr_1fr_1fr]";

type BulkAction = "submission" | "billing";

// Per-action display config used by both the button labels and the result messages.
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

// ── Bulk Action Bar ────────────────────────────────────────────────────────────

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
      className="px-5 py-3 flex items-center gap-3 flex-wrap"
      style={{ background: "#eef4ff", borderBottom: "1px solid #c7d9f8" }}
    >
      <span className="text-sm font-semibold text-primary flex-shrink-0">
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
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            {isThisAction ? cfg.pendingLabel : cfg.label}
          </button>
        );
      })}

      <button
        onClick={onClear}
        disabled={isPending}
        className="text-xs text-muted hover:text-dim transition-colors disabled:opacity-40"
      >
        Clear
      </button>

      {result && lastAction && (
        <div className="flex items-center gap-2 ml-auto min-w-0">
          {result.error ? (
            <span className="text-xs font-medium text-red-700 truncate">{result.error}</span>
          ) : (
            <span className={`text-xs font-medium truncate ${result.updated > 0 ? "text-emerald-700" : "text-muted"}`}>
              {result.updated > 0
                ? `${result.updated} ${BULK_ACTION_CONFIG[lastAction].successLabel}${
                    result.skipped.length > 0
                      ? ` · ${result.skipped.length} skipped`
                      : ""
                  }`
                : `0 updated — selected projects ${BULK_ACTION_CONFIG[lastAction].zeroLabel}`}
            </span>
          )}
          <button
            onClick={onDismissResult}
            className="text-xs text-faint hover:text-muted transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────────

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

  // Clear selection (and stale action context) when the project list changes
  // (tab navigation or external data refresh). Do NOT clear result here — it
  // would wipe the success/skip message immediately after router.refresh()
  // resolves with a new projects array reference, before the admin reads it.
  // Result is cleared only by: starting a new action, clearing selection, or
  // the user dismissing it.
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
    // Clear any stale result immediately so the bar doesn't briefly show a
    // previous action's result re-labeled with the new action's terminology
    // while the transition is in flight.
    setLastAction(action);
    setResult(null);
    startTransition(async () => {
      const res = action === "submission"
        ? await bulkMarkWaitingOnAuthority(ids)
        : await bulkMarkInvoiceSent(ids);
      setResult(res);
      if (!res.error && res.updated > 0) {
        // On partial success: deselect only the rows that were updated —
        // keep only the skipped rows selected so the admin can see exactly
        // which ones didn't apply and act on them individually.
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
        className="bg-card rounded-xl px-6 py-16 text-center"
        style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
      >
        <p className="text-sm text-muted">No projects in this category.</p>
      </div>
    );
  }

  return (
    <div
      className="bg-card rounded-xl overflow-hidden"
      style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
    >
      {/* Bulk action bar */}
      <BulkActionBar
        selected={selectedIds}
        onAction={handleAction}
        onClear={() => { setSelectedIds(new Set()); setResult(null); setLastAction(null); /* explicit clear: wipe result too */ }}
        isPending={isPending}
        result={result}
        lastAction={lastAction}
        onDismissResult={() => setResult(null)}
      />

      {/* Table header */}
      <div className={`grid ${COLS} gap-4 px-5 py-3 bg-canvas items-center`}>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected; }}
          onChange={toggleAll}
          className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
          aria-label="Select all projects"
          title={allSelected ? "Deselect all" : "Select all"}
        />
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Project</span>
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Client · Authority</span>
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Status</span>
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider hidden lg:block">Designer</span>
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider hidden lg:block">Submitted</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-surface">
        {projects.map((p) => {
          const isSelected = selectedIds.has(p.id);
          return (
            <div
              key={p.id}
              className={`grid ${COLS} gap-4 px-5 items-center transition-colors ${
                isSelected ? "bg-blue-50/60" : "hover:bg-surface"
              }`}
            >
              {/* Checkbox cell — does NOT navigate */}
              <div className="flex items-center justify-center py-3.5">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleId(p.id)}
                  className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                  aria-label={`Select ${p.job_name}`}
                />
              </div>

              {/* Data columns — clicking navigates */}
              <Link
                href={`/admin/projects/${p.id}`}
                className="col-span-5 grid gap-4 py-3.5 items-center group"
                style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr" }}
              >
                {/* Job info */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate group-hover:text-primary transition-colors">
                    {p.job_name}
                  </p>
                  <p className="text-xs text-muted font-mono mt-0.5">{p.job_number}</p>
                </div>

                {/* Client · Authority */}
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{p.company_name ?? "—"}</p>
                  <p className="text-xs text-muted truncate">
                    {p.county ? `${p.county} County` : p.authority_type ?? "—"}
                  </p>
                </div>

                {/* Status + optional alert tag */}
                <div className="space-y-1">
                  <ProjectStatusBadge status={p.unified_status} />
                  {(() => {
                    const alert = computeSubmissionAlert(p.status, p.updated_at);
                    return alert ? (
                      <p className={`text-[10px] font-semibold leading-none ${ALERT_SEVERITY_TEXT[alert.severity]}`}>
                        ⚠ {alert.label}
                      </p>
                    ) : null;
                  })()}
                </div>

                {/* Designer */}
                <div className="hidden lg:block">
                  {p.assigned_designer_name ? (
                    <div className="flex items-center gap-2">
                      <UserAvatar displayName={p.assigned_designer_name} />
                      <span className="text-sm text-dim truncate">{p.assigned_designer_name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-faint">—</span>
                  )}
                </div>

                {/* Date */}
                <div className="hidden lg:block">
                  <span className="text-xs text-muted">{formatDate(p.created_at)}</span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
