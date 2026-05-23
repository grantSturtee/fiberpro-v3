"use client";

import Link from "next/link";
import { signOut } from "@/app/actions/auth";

function IconSignOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 8h7M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

type CompanyTopbarProps = {
  companyName?: string;
  displayName?: string;
  initials?: string;
};

export function CompanyTopbar({ companyName, displayName, initials }: CompanyTopbarProps) {
  return (
    <header
      className="h-14 flex-shrink-0 flex items-center px-6 gap-4 bg-card"
      style={{ boxShadow: "0 1px 0 rgba(43,52,55,0.07)" }}
    >
      {/* Company name */}
      <div className="flex-1 min-w-0">
        {companyName && (
          <p className="text-sm font-medium text-ink truncate">{companyName}</p>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Link
          href="/company/submit"
          className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          + Submit Project
        </Link>

        <div
          className="flex items-center gap-2.5 pl-3"
          style={{ borderLeft: "1px solid #e3e9ec" }}
        >
          {/* User avatar */}
          <div
            className="w-7 h-7 rounded-full bg-primary-soft flex items-center justify-center flex-shrink-0"
            title={displayName}
          >
            <span className="text-[10px] font-semibold text-primary">
              {initials || "?"}
            </span>
          </div>

          {/* Sign out icon */}
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              className="text-muted hover:text-dim transition-colors flex items-center"
            >
              <IconSignOut />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
