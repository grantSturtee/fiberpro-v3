"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { daysSinceUpdate } from "@/lib/utils/projectUpdateStatus";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StaleProject = {
  id: string;
  jobNumber: string;
  jobName: string;
  companyName: string | null;
  designerId: string | null;
  designerName: string | null;
  status: string;
  lastUpdateAt: string | null;
};

// ── Status labels (internal, compact) ─────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  intake_review:             "Intake Review",
  waiting_on_client:         "Waiting (Client)",
  ready_for_assignment:      "Ready to Assign",
  assigned:                  "Assigned",
  in_design:                 "In Design",
  waiting_for_admin_review:  "Awaiting Review",
  revisions_required:        "Revisions",
  authority_action_needed:   "Authority Action",
  approved:                  "Approved",
  package_generating:        "Generating",
  ready_for_submission:      "Ready to Submit",
  submitted:                 "Submitted",
  waiting_on_authority:      "With Authority",
};

// ── Person icon ───────────────────────────────────────────────────────────────

function PersonIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </svg>
  );
}

// ── Designer filter dropdown ───────────────────────────────────────────────────

function DesignerFilterDropdown({
  designers,
  selectedId,
  onChange,
}: {
  designers: { id: string; name: string }[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selectedLabel =
    selectedId
      ? (designers.find((d) => d.id === selectedId)?.name ?? "All")
      : "All Employees";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-card text-muted hover:text-ink transition-colors"
        style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
      >
        <PersonIcon />
        <span>{selectedLabel}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path
            d="M2 3.5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-20 bg-card rounded-xl overflow-hidden min-w-[160px]"
          style={{ boxShadow: "0 4px 20px rgba(43,52,55,0.12)" }}
        >
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-3.5 py-2 text-xs transition-colors ${
              selectedId === null
                ? "bg-wash text-ink font-medium"
                : "text-dim hover:bg-wash hover:text-ink"
            }`}
          >
            All Employees
          </button>
          {designers.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => { onChange(d.id); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-xs transition-colors ${
                selectedId === d.id
                  ? "bg-wash text-ink font-medium"
                  : "text-dim hover:bg-wash hover:text-ink"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function NeedsUpdateSection({
  projects,
  staleDays,
}: {
  projects: StaleProject[];
  staleDays: number;
}) {
  const [selectedDesignerId, setSelectedDesignerId] = useState<string | null>(null);

  // Derive unique designers from the stale list — only those with stale projects appear
  const designers: { id: string; name: string }[] = (() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    for (const p of projects) {
      if (p.designerId && !seen.has(p.designerId)) {
        seen.add(p.designerId);
        result.push({ id: p.designerId, name: p.designerName ?? "Unknown" });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const filteredProjects = selectedDesignerId
    ? projects.filter((p) => p.designerId === selectedDesignerId)
    : projects;

  const selectedDesignerName =
    selectedDesignerId
      ? (designers.find((d) => d.id === selectedDesignerId)?.name ?? null)
      : null;

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1">
          <h2 className="text-sm font-semibold text-ink">Needs Update</h2>
          <span
            className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
              filteredProjects.length > 0
                ? "bg-amber-100 text-amber-700"
                : "bg-wash text-muted"
            }`}
          >
            {filteredProjects.length}
          </span>
          <span className="text-[11px] text-faint">
            {selectedDesignerName
              ? `stale projects for ${selectedDesignerName}`
              : `active projects with no update in ${staleDays}+ days`}
          </span>
        </div>

        {/* Filter — only rendered when there are assigned designers in the stale list */}
        {designers.length > 0 && (
          <DesignerFilterDropdown
            designers={designers}
            selectedId={selectedDesignerId}
            onChange={setSelectedDesignerId}
          />
        )}
      </div>

      {/* List */}
      <div
        className="rounded-xl bg-card overflow-hidden"
        style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
      >
        {filteredProjects.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted text-center">
            {selectedDesignerName
              ? `No stale projects for ${selectedDesignerName}.`
              : "All active projects are up to date."}
          </p>
        ) : (
          <ul>
            {filteredProjects.map((project, idx) => {
              const days = daysSinceUpdate(project.lastUpdateAt);
              const staleness =
                days === null
                  ? { label: "No updates yet", cls: "text-red-500" }
                  : { label: `${days}d ago`, cls: "text-amber-600" };

              const statusLabel = STATUS_LABELS[project.status] ?? project.status;

              return (
                <li key={project.id} className={idx > 0 ? "border-t border-surface" : ""}>
                  <Link
                    href={`/admin/projects/${project.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-wash transition-colors group"
                  >
                    {/* Job number + name */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[11px] font-mono font-semibold text-primary whitespace-nowrap flex-shrink-0">
                        {project.jobNumber}
                      </span>
                      <span className="text-sm text-ink truncate">
                        {project.jobName}
                      </span>
                    </div>

                    {/* Right: status · designer · staleness */}
                    <div className="flex-shrink-0 flex items-center gap-3">

                      {/* Company — secondary context, hidden on smaller screens */}
                      {project.companyName && (
                        <span className="hidden lg:block text-xs text-muted truncate max-w-[120px]">
                          {project.companyName}
                        </span>
                      )}

                      {/* Status label */}
                      <span className="hidden sm:block text-[11px] text-muted whitespace-nowrap">
                        {statusLabel}
                      </span>

                      {/* Designer */}
                      {project.designerName ? (
                        <span className="hidden sm:flex items-center gap-1 text-[11px] text-dim whitespace-nowrap">
                          <PersonIcon />
                          {project.designerName}
                        </span>
                      ) : (
                        <span className="hidden sm:block text-[11px] text-faint whitespace-nowrap">
                          Unassigned
                        </span>
                      )}

                      {/* Staleness */}
                      <span className={`text-xs font-medium whitespace-nowrap ${staleness.cls}`}>
                        {staleness.label}
                      </span>

                      {/* Arrow */}
                      <span className="text-faint group-hover:text-muted transition-colors text-xs">
                        →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
