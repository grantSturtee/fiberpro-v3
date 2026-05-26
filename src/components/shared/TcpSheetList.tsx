"use client";

// Shared TCP Design Files list (Issue 4 Phase B).
//
// Used by both the admin Project page and the designer Project page so the two
// views render the same row layout, drag handle, and view affordance. Reorder
// is gated by the `canReorder` prop (set false for unassigned viewers) and the
// server action in src/lib/actions/tcpReorder.ts re-checks authorization.
//
// Drag-and-drop is implemented with native HTML5 events. No new dependency.
// Whole-row drag is the simplest accessible approach: the visible handle on the
// left is the discoverability hint; the cursor shows `grab`/`grabbing` over it.
// If a user prefers mobile/keyboard reorder, Phase C can layer on up/down
// buttons; this phase deliberately keeps the surface small.
//
// Per-file delete is rendered via a `renderDelete` slot so each caller plugs in
// its own existing delete component (admin: none for TCP; designer:
// DeleteTCPFileForm). No coupling to either.

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Eye, GripVertical } from "lucide-react";
import { reorderTcpSheets } from "@/lib/actions/tcpReorder";
import { formatDate } from "@/lib/utils/format";
import { FileTypeBadge } from "@/components/ui/FileTypeBadge";

export type TcpSheetListItem = {
  id: string;
  file_name: string;
  created_at: string;
  uploader_label?: string | null;
  signedUrl?: string | null;
};

type Props = {
  projectId: string;
  files: TcpSheetListItem[];
  canReorder: boolean;
  /** Optional per-row delete control (e.g. designer's DeleteTCPFileForm). */
  renderDelete?: (file: TcpSheetListItem) => ReactNode;
  /**
   * When true, show the uploader label above the date. Admin includes it;
   * designer's row layout omits it for compactness.
   */
  showUploaderLabel?: boolean;
};

export function TcpSheetList({
  projectId,
  files,
  canReorder,
  renderDelete,
  showUploaderLabel = false,
}: Props) {
  const [order, setOrder] = useState<TcpSheetListItem[]>(files);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Resync to parent prop when the set of file ids changes (upload/delete) or
  // server revalidation lands. Pure reordering of the same id set leaves this
  // identity stable, so optimistic local order is preserved while the action
  // is in flight.
  const idsKey = files.map((f) => f.id).sort().join("|");
  useEffect(() => {
    setOrder(files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  function moveTo(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= order.length || toIdx >= order.length) {
      return;
    }
    const next = order.slice();
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    setOrder(next);
    setError(null);

    startTransition(async () => {
      const result = await reorderTcpSheets(
        projectId,
        next.map((f) => f.id),
      );
      if (!result.ok) {
        setError(result.error);
        // Revert optimistic order on failure so the UI stays truthful.
        setOrder(order);
      }
    });
  }

  function onDragStart(e: React.DragEvent<HTMLDivElement>, idx: number) {
    if (!canReorder) return;
    setDragIndex(idx);
    setError(null);
    e.dataTransfer.effectAllowed = "move";
    // Firefox needs data set or drag is cancelled.
    e.dataTransfer.setData("text/plain", String(idx));
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>, idx: number) {
    if (!canReorder || dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (idx !== hoverIndex) setHoverIndex(idx);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>, idx: number) {
    if (!canReorder || dragIndex === null) return;
    e.preventDefault();
    moveTo(dragIndex, idx);
    setDragIndex(null);
    setHoverIndex(null);
  }

  function onDragEnd() {
    setDragIndex(null);
    setHoverIndex(null);
  }

  if (order.length === 0) return null;

  return (
    <div>
      {error && (
        <p className="text-xs text-[#DC2626] mb-2" role="alert">
          {error}
        </p>
      )}
      <div className="divide-y divide-[#E5E7EB]">
        {order.map((file, idx) => {
          const isDragging = dragIndex === idx;
          const isHover = hoverIndex === idx && dragIndex !== null && dragIndex !== idx;
          return (
            <div
              key={file.id}
              draggable={canReorder}
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={(e) => onDrop(e, idx)}
              onDragEnd={onDragEnd}
              className={[
                "flex items-center gap-2.5 py-2.5 transition-colors",
                isDragging ? "opacity-40" : "",
                isHover ? "bg-[#EFF6FF]" : "",
              ].filter(Boolean).join(" ")}
            >
              {/* Drag handle (or spacer) */}
              {canReorder ? (
                <span
                  className="text-[#9CA3AF] hover:text-[#6B7280] cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5"
                  title="Drag to reorder"
                  aria-hidden
                >
                  <GripVertical size={14} strokeWidth={1.5} />
                </span>
              ) : (
                <span className="w-3 flex-shrink-0" aria-hidden />
              )}

              {/* PDF badge */}
              <FileTypeBadge fileName={file.file_name} />

              {/* Name + meta */}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[#111827] truncate">{file.file_name}</p>
                <p className="text-xs text-[#6B7280]">
                  {showUploaderLabel && file.uploader_label ? `${file.uploader_label} · ` : ""}
                  {formatDate(file.created_at)}
                </p>
              </div>

              {/* Actions: view (eye icon), then optional delete */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {file.signedUrl ? (
                  <a
                    href={file.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`View ${file.file_name}`}
                    aria-label={`View ${file.file_name}`}
                    className="p-1.5 rounded text-[#6B7280] hover:text-[#1565C0] transition-colors"
                  >
                    <Eye size={14} strokeWidth={1.5} />
                  </a>
                ) : (
                  <span className="p-1.5 text-[#9CA3AF]" aria-hidden>
                    <Eye size={14} strokeWidth={1.5} />
                  </span>
                )}
                {renderDelete?.(file)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
