"use client";

import { useState } from "react";

/**
 * Download link with light click-cooldown protection.
 * Prevents rapid repeated clicks from triggering multiple simultaneous downloads.
 * The href should be a signed URL generated with { download: true } so the
 * browser receives Content-Disposition: attachment regardless of file type.
 */
export function FileDownloadLink({ href }: { href: string }) {
  const [cooldown, setCooldown] = useState(false);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (cooldown) {
      e.preventDefault();
      return;
    }
    setCooldown(true);
    setTimeout(() => setCooldown(false), 2000);
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      title="Download file"
      className={
        cooldown
          ? "text-faint flex-shrink-0 cursor-default"
          : "text-muted hover:text-primary transition-colors flex-shrink-0"
      }
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    </a>
  );
}
