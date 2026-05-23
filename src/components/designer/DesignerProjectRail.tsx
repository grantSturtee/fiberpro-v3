"use client";

import { useState } from "react";
import { RailFileNav } from "@/components/admin/RailFileNav";
import { AdminNotesRail, type NoteEntry } from "@/components/admin/AdminNotesRail";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_WIDTH = 260;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

type FileNavItem = { label: string; count: number; targetId: string };

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
      {children}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DesignerProjectRail({
  fileNavItems,
  projectId,
  notes,
  revalidatePath,
  currentUserId,
  currentUserRole,
  unreadCount = 0,
}: {
  fileNavItems: FileNavItem[];
  projectId: string;
  notes: NoteEntry[];
  revalidatePath: string;
  currentUserId: string;
  currentUserRole: string;
  unreadCount?: number;
  // activity is no longer rendered in the rail — use the Activity tab instead
  activity?: unknown;
}) {
  const [railWidth, setRailWidth] = useState(DEFAULT_WIDTH);
  const [displayUnreadCount, setDisplayUnreadCount] = useState(unreadCount);

  function onHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();

    const dragStartX = e.clientX;
    const dragStartWidth = railWidth;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    function onMouseMove(ev: MouseEvent) {
      const delta = ev.clientX - dragStartX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth - delta));
      setRailWidth(next);
    }

    function onMouseUp() {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      className="relative flex-shrink-0 flex flex-col border-l border-surface bg-canvas overflow-hidden"
      style={{ width: railWidth }}
    >
      {/* Invisible resize handle — left edge, full height */}
      <div
        className="absolute left-0 top-0 h-full w-[5px] cursor-col-resize z-10"
        onMouseDown={onHandleMouseDown}
      />

      {/* ── TOP: Files nav ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pt-3 pb-0">
        <SectionLabel>Files</SectionLabel>
        <RailFileNav containerId="project-main-scroll" items={fileNavItems} />
      </div>

      {/* ── BOTTOM: Project Conversation — fills all remaining space ──────── */}
      <div
        className="flex-1 overflow-hidden flex flex-col min-h-0 px-3 pt-3 pb-3"
        style={{ borderTop: "1px solid #e3e9ec", marginTop: "0.75rem" }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <SectionLabel>Project Conversation</SectionLabel>
          {displayUnreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-white mb-1.5 flex-shrink-0">
              {displayUnreadCount > 9 ? "9+" : displayUnreadCount}
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <AdminNotesRail
            projectId={projectId}
            notes={notes}
            revalidatePath={revalidatePath}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            onEngaged={() => setDisplayUnreadCount(0)}
          />
        </div>
      </div>
    </div>
  );
}
