"use client";

import { signOut } from "@/app/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-[10px] text-muted hover:text-dim transition-colors"
        title="Sign out"
      >
        Sign out
      </button>
    </form>
  );
}
