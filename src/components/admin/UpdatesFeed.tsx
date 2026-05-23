"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  firstJobNameSegment,
  UPDATE_STATUS_META,
  type UpdateStatus,
} from "@/lib/utils/projectUpdateStatus";

// ── Types ─────────────────────────────────────────────────────────────────────

export type UpdateFeedRow = {
  id: string;
  body: string | null;
  status: string | null;
  created_by: string;
  created_at: string;
  project_id: string;
  jobNumber: string | null;
  jobName: string;
  companyName: string | null;
};

export type AuthorInfo = {
  displayName: string;
  avatarUrl: string | null;
};

export type InternalUser = {
  id: string;
  displayName: string;
};

// ── Formatters ────────────────────────────────────────────────────────────────

function formatUpdateTime(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatUpdateDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

// ── Range tab definitions ─────────────────────────────────────────────────────

const RANGE_TABS = [
  { key: "all",   label: "All" },
  { key: "today", label: "Today" },
  { key: "3days", label: "Last 3 days" },
] as const;

// ── Employee dropdown ─────────────────────────────────────────────────────────

function EmployeeDropdown({
  internalUsers,
  selectedUserId,
  onChange,
}: {
  internalUsers: InternalUser[];
  selectedUserId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  const selectedLabel =
    selectedUserId
      ? (internalUsers.find((u) => u.id === selectedUserId)?.displayName ?? "All Employees")
      : "All Employees";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-card text-muted hover:text-ink transition-colors"
        style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
      >
        <span>{selectedLabel}</span>
        {/* chevron down */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
              selectedUserId === null
                ? "bg-wash text-ink font-medium"
                : "text-dim hover:bg-wash hover:text-ink"
            }`}
          >
            All Employees
          </button>
          {internalUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onChange(u.id); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-xs transition-colors ${
                selectedUserId === u.id
                  ? "bg-wash text-ink font-medium"
                  : "text-dim hover:bg-wash hover:text-ink"
              }`}
            >
              {u.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feed ──────────────────────────────────────────────────────────────────────

export function UpdatesFeed({
  rows,
  authorMap,
  internalUsers,
  activeRange,
}: {
  rows: UpdateFeedRow[];
  authorMap: Record<string, AuthorInfo>;
  internalUsers: InternalUser[];
  activeRange: string;
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const filteredRows = selectedUserId
    ? rows.filter((r) => r.created_by === selectedUserId)
    : rows;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        {/* Range tabs */}
        <div
          className="flex items-center gap-1 bg-card rounded-xl px-2 py-1.5"
          style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
        >
          {RANGE_TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/updates?range=${t.key}`}
              className={`
                px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${t.key === activeRange
                  ? "bg-wash text-ink"
                  : "text-muted hover:text-ink hover:bg-surface"}
              `}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* Employee filter */}
        <EmployeeDropdown
          internalUsers={internalUsers}
          selectedUserId={selectedUserId}
          onChange={setSelectedUserId}
        />
      </div>

      {/* Feed list */}
      <div
        className="rounded-xl bg-card overflow-hidden"
        style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.05)" }}
      >
        {filteredRows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted text-center">
            No updates{activeRange !== "all" || selectedUserId ? " matching this filter" : ""}.
          </p>
        ) : (
          <ul>
            {filteredRows.map((update, idx) => {
              const author = authorMap[update.created_by] ?? {
                displayName: "Unknown",
                avatarUrl: null,
              };

              const updateTime = formatUpdateTime(update.created_at);
              const updateDate = formatUpdateDate(update.created_at);

              const statusMeta = update.status ? UPDATE_STATUS_META[update.status as UpdateStatus] : null;

              return (
                <li
                  key={update.id}
                  className={`flex items-stretch ${idx > 0 ? "border-t border-surface" : ""}`}
                >
                  {/* ── Author block ─────────────────────────────────── */}
                  <div className="w-14 flex-shrink-0 flex flex-col items-center pt-4 pb-4 px-1">
                    <UserAvatar
                      displayName={author.displayName}
                      avatarUrl={author.avatarUrl}
                      size="sm"
                    />
                    <span className="mt-1.5 text-[9px] text-faint text-center leading-snug w-[52px] break-words">
                      {author.displayName}
                    </span>
                  </div>

                  {/* ── Accent strip — colored by status ── */}
                  <div
                    className="w-[3px] flex-shrink-0 rounded-full my-3"
                    style={{ background: statusMeta ? statusMeta.barColor : "#dce5ea" }}
                  />

                  {/* ── Content ──────────────────────────────────────── */}
                  <div className="flex-1 min-w-0 py-4 pl-3 pr-5">

                    {/* Header row */}
                    <div className="flex items-center justify-between gap-4 mb-2">

                      {/* Left: job number + name (truncated) */}
                      <div className="flex items-baseline gap-1 min-w-0 flex-1 overflow-hidden">
                        <Link
                          href={`/admin/projects/${update.project_id}`}
                          className="text-[13px] font-semibold text-ink hover:text-primary transition-colors whitespace-nowrap flex-shrink-0"
                        >
                          {update.jobNumber ?? firstJobNameSegment(update.jobName)}
                        </Link>
                        {update.jobNumber && (
                          <>
                            <span className="text-[13px] text-muted flex-shrink-0 whitespace-nowrap"> — </span>
                            <span className="text-[13px] text-ink truncate">
                              {firstJobNameSegment(update.jobName)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Right: company + timestamp */}
                      <div className="flex-shrink-0 flex items-center gap-3">
                        {update.companyName && (
                          <span className="text-xs text-muted whitespace-nowrap">{update.companyName}</span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-faint whitespace-nowrap">{updateTime}</span>
                          <span className="text-[11px] text-faint whitespace-nowrap">{updateDate}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status label + body */}
                    <div className="space-y-0.5">
                      {statusMeta && (
                        <p className="text-xs font-bold" style={{ color: statusMeta.color }}>{statusMeta.label}</p>
                      )}
                      {update.body && (
                        <p className="text-sm text-ink leading-[1.65] whitespace-pre-wrap">{update.body}</p>
                      )}
                    </div>

                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
