"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { sendProjectMessage, type MessageActionState } from "@/app/actions/messages";
import { formatDateTime } from "@/lib/utils/format";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectMessage = {
  id: string;
  sender_label: string;
  sender_role: string | null;
  body: string;
  created_at: string;
};

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin:           "GRANTED",
  designer:        "Designer",
  company_admin:   "Company",
  project_manager: "Company",
};

const ROLE_COLORS: Record<string, string> = {
  admin:           "bg-primary-soft text-primary",
  designer:        "bg-violet-100 text-violet-700",
  company_admin:   "bg-emerald-50 text-emerald-700",
  project_manager: "bg-emerald-50 text-emerald-700",
};

function RoleBadge({ role }: { role: string | null }) {
  const r = role ?? "unknown";
  const label = ROLE_LABELS[r] ?? r;
  const color = ROLE_COLORS[r] ?? "bg-wash text-muted";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${color}`}>
      {label}
    </span>
  );
}

// ── Send button ───────────────────────────────────────────────────────────────

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? (
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Sending…
        </span>
      ) : "Send"}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const initialState: MessageActionState = { error: null };

export function ProjectMessagesThread({
  projectId,
  messages,
  revalidatePath,
}: {
  projectId: string;
  messages: ProjectMessage[];
  revalidatePath: string;
}) {
  const [state, formAction] = useActionState(sendProjectMessage, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset form on success
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="space-y-4">
      {/* Message list */}
      <div
        ref={scrollRef}
        className="space-y-3 max-h-[360px] overflow-y-auto pr-1"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted py-2">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-wash flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] font-semibold text-dim">
                  {(msg.sender_label || "?").slice(0, 1).toUpperCase()}
                </span>
              </div>
              <div className="bg-surface rounded-xl px-4 py-3 flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-xs font-semibold text-ink">{msg.sender_label || "Unknown"}</p>
                  <RoleBadge role={msg.sender_role} />
                  <p className="text-[10px] text-muted ml-auto">{formatDateTime(msg.created_at)}</p>
                </div>
                <p className="text-sm text-dim whitespace-pre-wrap break-words">{msg.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Compose area */}
      <div className="pt-4" style={{ borderTop: "1px solid #e3e9ec" }}>
        <form ref={formRef} action={formAction} className="space-y-2">
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="revalidate_path" value={revalidatePath} />
          <textarea
            name="body"
            rows={3}
            required
            className="w-full text-sm text-ink bg-surface rounded-xl px-4 py-3 resize-none outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
            placeholder="Write a message…"
          />
          <div className="flex items-center justify-between gap-3">
            <div>
              {state.error && (
                <p className="text-xs text-red-600">{state.error}</p>
              )}
            </div>
            <SendButton />
          </div>
        </form>
      </div>
    </div>
  );
}
