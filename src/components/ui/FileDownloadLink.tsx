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
      className={
        cooldown
          ? "text-xs text-faint flex-shrink-0 cursor-default"
          : "text-xs text-primary hover:underline flex-shrink-0"
      }
    >
      Download
    </a>
  );
}
