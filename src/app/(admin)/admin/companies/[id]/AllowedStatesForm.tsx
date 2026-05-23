"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { US_STATES } from "@/lib/constants/authorities";
import { updateAllowedStates, type CompanyActionState } from "./actions";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_ABBRS = US_STATES.map((s) => s.abbr);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert stored allowed_states → a Set of allowed abbreviations.
 *  null or [] → empty Set (no states allowed — default restricted)
 *  [...]      → only those states are allowed */
function toSet(current: string[] | null): Set<string> {
  if (!current || current.length === 0) return new Set();
  return new Set(current);
}

/** Convert the live UI Set back to the value we'll persist.
 *  Empty set → null (no states allowed).
 *  Non-empty → explicit array of allowed abbreviations. */
function setToAllowed(set: Set<string>): string[] | null {
  if (set.size === 0) return null;
  return ALL_ABBRS.filter((a) => set.has(a));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Build the short inline summary shown after a successful save. */
function buildSummary(saved: string[] | null): string {
  if (!saved || saved.length === 0) return "No states allowed";
  if (saved.length === ALL_ABBRS.length) return "All states allowed";

  const restricted = ALL_ABBRS.filter((a) => !saved.includes(a));
  const MAX = 4;

  // Show whichever list is shorter
  if (restricted.length <= saved.length) {
    const shown = restricted.slice(0, MAX);
    const extra = restricted.length - shown.length;
    return `Restricted: ${shown.join(", ")}${extra > 0 ? ` +${extra} more` : ""}`;
  } else {
    const shown = saved.slice(0, MAX);
    const extra = saved.length - shown.length;
    return `Allowed: ${shown.join(", ")}${extra > 0 ? ` +${extra} more` : ""}`;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SaveButton({ isDirty }: { isDirty: boolean }) {
  const { pending } = useFormStatus();
  const active = isDirty && !pending;
  return (
    <button
      type="submit"
      disabled={!active}
      className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-opacity"
      style={{
        background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)",
        opacity: active ? 1 : 0.35,
        cursor: active ? "pointer" : "default",
      }}
    >
      {pending ? "Saving…" : "Save Restrictions"}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const initialState: CompanyActionState = { error: null };

type Props = {
  companyId: string;
  /** Saved allowed_states from DB. null = no restriction (all allowed). */
  current: string[] | null;
};

export function AllowedStatesForm({ companyId, current }: Props) {
  const [actionState, formAction] = useActionState(updateAllowedStates, initialState);

  // liveSet = which states are currently marked as allowed in the UI
  const [liveSet, setLiveSet] = useState<Set<string>>(() => toSet(current));

  // savedSet is recomputed from the current prop each render.
  // After a successful save + revalidation, current is updated by the server,
  // so savedSet naturally reflects what was last persisted.
  const savedSet = toSet(current);
  const isDirty = !setsEqual(liveSet, savedSet);

  // Show inline summary when the last action succeeded and there are no pending changes
  const showSummary = !!actionState.success && !isDirty;

  function toggle(abbr: string) {
    setLiveSet((prev) => {
      const next = new Set(prev);
      if (next.has(abbr)) next.delete(abbr);
      else next.add(abbr);
      return next;
    });
  }

  // The hidden inputs we submit represent the allowed states.
  // null (all allowed) is represented by submitting no allowed_states entries,
  // which the server action correctly interprets as null.
  const allowedToSubmit = setToAllowed(liveSet);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="company_id" value={companyId} />
      {allowedToSubmit !== null &&
        allowedToSubmit.map((abbr) => (
          <input key={abbr} type="hidden" name="allowed_states" value={abbr} />
        ))}

      <p className="text-xs text-muted">
        Green = allowed &middot; Red = restricted
      </p>

      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
        {US_STATES.map((s) => {
          const allowed = liveSet.has(s.abbr);
          return (
            <button
              key={s.abbr}
              type="button"
              onClick={() => toggle(s.abbr)}
              title={s.name}
              className={[
                "py-1.5 text-xs font-semibold rounded border transition-colors select-none",
                allowed
                  ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300"
                  : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300",
              ].join(" ")}
            >
              {s.abbr}
            </button>
          );
        })}
      </div>

      {actionState.error && (
        <p className="text-sm text-red-600">{actionState.error}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <SaveButton isDirty={isDirty} />
        {showSummary && (
          <span className="text-xs text-muted">
            Saved &middot; {buildSummary(current)}
          </span>
        )}
      </div>
    </form>
  );
}
