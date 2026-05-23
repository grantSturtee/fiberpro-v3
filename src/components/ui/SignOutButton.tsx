"use client";

import { signOut } from "@/app/actions/auth";

function IconLogOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9.5 9.5L12 7l-2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7H5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-muted hover:text-dim transition-colors flex items-center justify-center"
        title="Sign out"
      >
        <IconLogOut />
      </button>
    </form>
  );
}
