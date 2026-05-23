"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const FILTER_STATES = [
  { value: "", label: "All States" },
  { value: "NJ", label: "New Jersey" },
  { value: "NY", label: "New York" },
  { value: "PA", label: "Pennsylvania" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
];

export function TcdStateFilter({ current }: { current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function handleSelect(value: string) {
    setOpen(false);
    router.replace(
      value ? `/admin/settings/tcd?state=${encodeURIComponent(value)}` : "/admin/settings/tcd"
    );
  }

  const selectedLabel = FILTER_STATES.find((s) => s.value === current)?.label ?? "All States";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-surface text-ink hover:bg-wash transition-colors"
        style={{ border: "1px solid #d4dde4", minWidth: "9.5rem" }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 text-left">{selectedLabel}</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden
          className={`transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full left-0 mt-1 z-20 bg-card rounded-xl overflow-hidden min-w-full"
          style={{ boxShadow: "0 4px 20px rgba(43,52,55,0.12)" }}
        >
          {FILTER_STATES.map((s) => (
            <button
              key={s.value || "__all__"}
              type="button"
              role="option"
              aria-selected={s.value === current}
              onClick={() => handleSelect(s.value)}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                s.value === current
                  ? "bg-wash text-ink font-medium"
                  : "text-dim hover:bg-wash hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
