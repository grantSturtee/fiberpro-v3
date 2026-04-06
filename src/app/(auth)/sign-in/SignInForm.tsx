"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

const initialState = { error: null as string | null };

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form className="space-y-4" action={formAction}>
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-dim mb-1.5">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                     outline-none transition-shadow focus:ring-2 focus:ring-primary/20 focus:ring-offset-0"
          style={{ border: "1px solid #d4dde4" }}
          placeholder="you@fiberpro.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-medium text-dim mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint
                     outline-none transition-shadow focus:ring-2 focus:ring-primary/20 focus:ring-offset-0"
          style={{ border: "1px solid #d4dde4" }}
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3.5 py-2.5">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity mt-2
                   disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
