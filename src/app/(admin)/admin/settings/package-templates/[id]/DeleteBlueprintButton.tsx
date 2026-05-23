"use client";

import { useState } from "react";
import { useActionState } from "react";
import { deleteBlueprint, type BlueprintActionState } from "../actions";

const initial: BlueprintActionState = { error: null };

export function DeleteBlueprintButton({ blueprintId }: { blueprintId: string }) {
  const [showModal, setShowModal] = useState(false);
  const [state, formAction, pending] = useActionState(deleteBlueprint, initial);

  return (
    <>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
      >
        Delete blueprint
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-canvas rounded-xl p-6 shadow-lg w-full max-w-sm mx-4">
            <p className="text-sm font-medium text-ink mb-5">
              Delete this blueprint permanently?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-rule text-dim hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <form action={formAction}>
                <input type="hidden" name="blueprint_id" value={blueprintId} />
                <button
                  type="submit"
                  disabled={pending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {pending ? "Deleting…" : "Delete"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
