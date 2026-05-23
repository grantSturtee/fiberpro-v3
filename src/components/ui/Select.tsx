"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Custom dropdown that submits its value through a hidden input so it can be
 * dropped into a form posting to a Next.js server action without any extra
 * plumbing. Controlled component: parent owns `value` via useState and passes
 * `onChange` to react to selections.
 *
 * Keyboard handling:
 *   - Closed:      Enter / Space / ArrowDown → open
 *   - Open:        ArrowUp / ArrowDown move highlight, Enter selects,
 *                  Escape closes without selecting
 *   - Outside click closes (mousedown listener on document)
 *
 * Visual styling mirrors the existing form inputs (bg-surface, rounded-lg,
 * border #d4dde4) so it slots into the pricing form without standing out.
 */
export function Select({
  name,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((o) => o.value === value) ?? null;

  // Close when clicking outside the component.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // When opening, sync highlight to the currently-selected option (or first
  // option if nothing is selected) so keyboard nav has a sane starting point.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlightIndex(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  const choose = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      // Restore focus to the button so subsequent keyboard input still works.
      buttonRef.current?.focus();
    },
    [onChange]
  );

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const o = options[highlightIndex];
      if (o) choose(o.value);
      return;
    }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full text-left bg-surface rounded-lg px-3.5 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-2"
        style={{ border: "1px solid #d4dde4" }}
      >
        <span className={selectedOption ? "text-ink" : "text-faint"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
          className="text-muted flex-shrink-0"
        >
          <path
            d="M2 4l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Hidden input — what the form actually posts. */}
      <input type="hidden" name={name} value={value} />

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-lg bg-card shadow-lg py-1"
          style={{ border: "1px solid #d4dde4" }}
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">No options</li>
          )}
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isHighlighted = i === highlightIndex;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={(e) => {
                  // mousedown (not click) so the option fires before the
                  // outside-click closer notices the dropdown lost focus.
                  e.preventDefault();
                  choose(o.value);
                }}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between gap-2 ${
                  isHighlighted ? "bg-surface" : ""
                } ${isSelected ? "text-ink font-medium" : "text-ink"}`}
              >
                <span>{o.label}</span>
                {isSelected && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden
                    className="text-primary flex-shrink-0"
                  >
                    <path
                      d="M2 6l3 3 5-6"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Select;
