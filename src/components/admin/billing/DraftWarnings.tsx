"use client";

/**
 * DraftWarnings (Phase E3)
 *
 * Renders the draft validation feedback as two stacked blocks:
 *   - red "Cannot send" if any `block` severity warning is present
 *   - amber "Review before sending" for `warn` severities
 *
 * No-op render when `warnings` is empty. Each block is plain markup; nothing
 * is collapsible — for a draft this is intentionally always visible so the
 * admin can't miss it.
 */

import type { DraftWarning } from "./warnings";

export function DraftWarnings({ warnings }: { warnings: DraftWarning[] }) {
  if (warnings.length === 0) return null;

  const blocks = warnings.filter((w) => w.severity === "block");
  const warns  = warnings.filter((w) => w.severity === "warn");

  return (
    <div className="space-y-2">
      {blocks.length > 0 && (
        <div
          role="alert"
          className="bg-red-50 border border-red-300 rounded-md px-3 py-2 space-y-1"
        >
          <p className="text-[11px] font-semibold text-red-900 uppercase tracking-wider">
            ⛔ Cannot send — fix these first
          </p>
          <ul className="text-xs text-red-800 space-y-0.5 list-disc list-inside">
            {blocks.map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {warns.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
          <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider">
            ⚠ Review before sending
          </p>
          <ul className="text-xs text-amber-900 space-y-0.5 list-disc list-inside">
            {warns.map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
