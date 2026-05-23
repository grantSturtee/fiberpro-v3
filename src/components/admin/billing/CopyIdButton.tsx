"use client";

/**
 * CopyIdButton (Phase G)
 *
 * Tiny utility for admins debugging an invoice or project. Clicking copies
 * the supplied value to the clipboard; shows a brief "Copied!" confirmation.
 * Used in the audit panel and on invoice cards/rows.
 */

import { useState } from "react";

type Props = {
  value: string;
  label?: string;
  title?: string;
  className?: string;
};

export function CopyIdButton({
  value,
  label = "Copy",
  title = "Copy to clipboard",
  className,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fall back to the legacy hidden-textarea approach so the button
      // never appears unresponsive on older / locked-down environments.
      try {
        const el = document.createElement("textarea");
        el.value = value;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.left = "-10000px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        // Silent fail; UI doesn't promise anything.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      className={
        className ??
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-canvas text-dim border border-rule hover:bg-wash hover:text-ink transition-colors"
      }
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
