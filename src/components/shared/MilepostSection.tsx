"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { saveMileposts, type MilepostActionState } from "@/lib/actions/mileposts";

type Props = {
  projectId: string;
  milepostStart: string | null;
  milepostEnd: string | null;
};

const inputCls =
  "w-full text-sm text-ink bg-canvas rounded-lg px-3 py-1.5 outline-none transition-colors";
const inputStyle = { border: "1px solid #d4dde4" };

export function MilepostSection({ projectId, milepostStart, milepostEnd }: Props) {
  const [state, formAction, pending] = useActionState<MilepostActionState, FormData>(
    saveMileposts,
    { error: null }
  );

  // Track saved values so we can detect dirt after a successful save.
  const [savedStart, setSavedStart] = useState(milepostStart ?? "");
  const [savedEnd,   setSavedEnd]   = useState(milepostEnd   ?? "");

  const [currentStart, setCurrentStart] = useState(milepostStart ?? "");
  const [currentEnd,   setCurrentEnd]   = useState(milepostEnd   ?? "");

  // After a successful save, advance the "saved" baseline so the button goes muted again.
  useEffect(() => {
    if (state.success) {
      setSavedStart(currentStart);
      setSavedEnd(currentEnd);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  const isDirty = currentStart !== savedStart || currentEnd !== savedEnd;

  return (
    <SectionCard title="Mileposts">
      <form action={formAction}>
        <input type="hidden" name="project_id" value={projectId} />

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
              Milepost Start
            </p>
            <input
              type="text"
              name="milepost_start"
              value={currentStart}
              onChange={(e) => setCurrentStart(e.target.value)}
              placeholder="e.g. 14.3"
              className={inputCls}
              style={inputStyle}
            />
          </div>

          <div className="flex-1">
            <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
              Milepost End
            </p>
            <input
              type="text"
              name="milepost_end"
              value={currentEnd}
              onChange={(e) => setCurrentEnd(e.target.value)}
              placeholder="e.g. 16.8"
              className={inputCls}
              style={inputStyle}
            />
          </div>

          <div className="flex-shrink-0 pb-0.5">
            <button
              type="submit"
              disabled={pending || !isDirty}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={
                isDirty && !pending
                  ? { background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)", color: "#fff" }
                  : { background: "#e3e9ec", color: "#8fa3af" }
              }
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {state.error && (
          <p className="mt-2 text-xs text-red-600">{state.error}</p>
        )}
        {state.success && !isDirty && (
          <p className="mt-2 text-xs text-emerald-600">Saved.</p>
        )}
      </form>
    </SectionCard>
  );
}
