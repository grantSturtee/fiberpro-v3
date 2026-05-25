"use client";

import { useState } from "react";
import { RailFileNav } from "@/components/admin/RailFileNav";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { AdminNotesRail, type NoteEntry } from "@/components/admin/AdminNotesRail";
import { AssignDesignerForm } from "@/components/admin/AssignDesignerForm";
import { SetupChecklist } from "@/components/admin/SetupChecklist";
import { formatDate } from "@/lib/utils/format";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RailSetupReadiness = {
  hasAuthority: boolean;
  hasActiveTemplate: boolean;
  missingBlueprintSections: string[];
  requiresApplicationForm: boolean;
  hasApplicationFormTemplate: boolean;
  hasSld: boolean;
  hasTcd: boolean;
  hasDesigner: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_WIDTH = 300;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 360;

// ── Types ─────────────────────────────────────────────────────────────────────

type FileNavItem = { label: string; count: number; targetId: string };

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280] mb-1.5">
      {children}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProjectRail({
  projectId,
  designerName,
  designerAvatarUrl,
  assignedAt,
  currentDesignerId,
  designers,
  isTerminal,
  fileNavItems,
  notes,
  revalidatePath,
  currentUserId,
  currentUserRole,
  unreadCount = 0,
  setupReadiness = null,
}: {
  projectId: string;
  designerName: string | null;
  designerAvatarUrl: string | null;
  assignedAt: string | null;
  currentDesignerId: string | null;
  designers: { id: string; display_name: string; email: string }[];
  isTerminal: boolean;
  fileNavItems: FileNavItem[];
  notes: NoteEntry[];
  revalidatePath: string;
  currentUserId: string;
  currentUserRole: string;
  unreadCount?: number;
  // When provided, render Setup Readiness widget above Designer. Pass null
  // (or omit) to hide it — caller decides based on the early-setup window.
  setupReadiness?: RailSetupReadiness | null;
  // unused props kept for call-site compatibility without a breaking change
  status?: unknown;
  billingStatus?: unknown;
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
      className="relative flex-shrink flex flex-col border-l border-[#E5E7EB] bg-[#F8F9FB] overflow-hidden"
      style={{ width: railWidth }}
    >
      {/* Invisible resize handle — left edge, full height */}
      <div
        className="absolute left-0 top-0 h-full w-[5px] cursor-col-resize z-10"
        onMouseDown={onHandleMouseDown}
      />

      {/* ── TOP: Setup Readiness (early-setup only) + Designer + Files ───── */}
      <div className="flex-shrink-0 px-3 pt-3 pb-0 space-y-3">

        {/* Setup Readiness — visible only while admin can mark setup complete */}
        {setupReadiness && (
          <SetupChecklist
            projectId={projectId}
            hasAuthority={setupReadiness.hasAuthority}
            hasActiveTemplate={setupReadiness.hasActiveTemplate}
            missingBlueprintSections={setupReadiness.missingBlueprintSections}
            requiresApplicationForm={setupReadiness.requiresApplicationForm}
            hasApplicationFormTemplate={setupReadiness.hasApplicationFormTemplate}
            hasSld={setupReadiness.hasSld}
            hasTcd={setupReadiness.hasTcd}
            hasDesigner={setupReadiness.hasDesigner}
            showMarkComplete
          />
        )}

        {/* Designer */}
        <div>
          <SectionLabel>Designer</SectionLabel>
          {designerName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <UserAvatar displayName={designerName} avatarUrl={designerAvatarUrl} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[#111827] truncate">{designerName}</p>
                  <p className="text-[10px] text-[#6B7280] leading-tight">Assigned {formatDate(assignedAt)}</p>
                </div>
              </div>
              {!isTerminal && designers.length > 0 && (
                <details className="group">
                  <summary className="list-none cursor-pointer text-[10px] text-[#1565C0] hover:underline select-none [&::-webkit-details-marker]:hidden">
                    Reassign →
                  </summary>
                  <div className="mt-2">
                    <AssignDesignerForm
                      projectId={projectId}
                      designers={designers}
                      currentDesignerId={currentDesignerId}
                    />
                  </div>
                </details>
              )}
            </div>
          ) : !isTerminal && designers.length > 0 ? (
            <AssignDesignerForm
              projectId={projectId}
              designers={designers}
              currentDesignerId={null}
            />
          ) : (
            <p className="text-xs text-[#6B7280]">Unassigned</p>
          )}
        </div>

        {/* Files */}
        <div className="pt-3" style={{ borderTop: "1px solid #E5E7EB" }}>
          <SectionLabel>Files</SectionLabel>
          <RailFileNav containerId="project-main-scroll" items={fileNavItems} />
        </div>

      </div>

      {/* ── BOTTOM: Project Conversation — fills all remaining space ──────── */}
      <div
        className="flex-1 overflow-hidden flex flex-col min-h-0 px-3 pt-3 pb-3"
        style={{ borderTop: "1px solid #E5E7EB", marginTop: "0.75rem" }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <SectionLabel>Project Conversation</SectionLabel>
          {displayUnreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#1565C0] text-[9px] font-bold text-white mb-1.5 flex-shrink-0">
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
