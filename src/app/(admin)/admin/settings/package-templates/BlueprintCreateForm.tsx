"use client";

import { useActionState } from "react";
import { createBlueprint, type BlueprintActionState } from "./actions";

type AuthorityOption = { id: string; name: string };

const initial: BlueprintActionState = { error: null };

export function BlueprintCreateForm({
  authorities,
}: {
  authorities: AuthorityOption[];
}) {
  const [state, formAction, pending] = useActionState(createBlueprint, initial);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
        {/* Authority */}
        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Authority <span className="text-red-500">*</span>
          </label>
          <select
            name="authority_profile_id"
            required
            className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">— Select authority —</option>
            {authorities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Work type */}
        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Work type <span className="text-red-500">*</span>
          </label>
          <select
            name="work_type"
            required
            defaultValue=""
            className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="" disabled>— Select work type —</option>
            <option value="aerial">Aerial</option>
            <option value="underground">Underground</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Description <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            name="description"
            placeholder="e.g. Standard NJ county aerial package"
            className="w-full rounded-lg border border-rule bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          {pending ? "Creating…" : "Create Blueprint"}
        </button>
      </div>

      <p className="text-xs text-muted">
        New blueprints start as <strong>Draft</strong> — configure slots and activate when ready.
      </p>
    </form>
  );
}
