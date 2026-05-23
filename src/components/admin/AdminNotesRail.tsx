"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  sendProjectMessage,
  updateProjectNote,
  deleteProjectNote,
  type MessageActionState,
} from "@/app/actions/messages";
import { UserAvatar } from "@/components/shared/UserAvatar";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NoteEntry = {
  id: string;
  sender_id: string;
  sender_label: string;
  sender_role: string | null;
  body: string;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Time-only if same day; date-only if older. Full title attr for hover. */
function formatSmartDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFullDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " at " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 14,4" />
      <path d="M5,4V2h6v2" />
      <path d="M3,4l1,10h8l1-10" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1.5 w-full px-2 py-1 rounded text-[11px] font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Sending…" : "Send Message"}
    </button>
  );
}

function EditButton({ isDirty }: { isDirty: boolean }) {
  const { pending } = useFormStatus();
  const active = isDirty && !pending;
  return (
    <button
      type="submit"
      disabled={!active}
      className="mt-1.5 w-full px-2 py-1 rounded text-[11px] font-semibold text-white transition-all"
      style={
        active
          ? { background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }
          : { background: "#c8d3da", cursor: "default" }
      }
    >
      {pending ? "Saving…" : "Make Changes"}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const initialState: MessageActionState = { error: null };

export function AdminNotesRail({
  projectId,
  notes,
  revalidatePath,
  currentUserId,
  currentUserRole,
  onEngaged,
}: {
  projectId: string;
  notes: NoteEntry[];
  revalidatePath: string;
  currentUserId: string;
  currentUserRole: string;
  onEngaged?: () => void;
}) {
  const isAdmin = currentUserRole === "admin";

  const [addState, addAction] = useActionState(sendProjectMessage, initialState);
  const [editState, editAction] = useActionState(updateProjectNote, initialState);
  const [deleteState, deleteAction] = useActionState(deleteProjectNote, initialState);

  const [editingNote, setEditingNote] = useState<NoteEntry | null>(null);
  const [composerText, setComposerText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showEditSuccess, setShowEditSuccess] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const isDirty = editingNote !== null && composerText.trim() !== editingNote.body.trim();

  // Clear unread badge as soon as the conversation mounts (it's visible to the user).
  useEffect(() => {
    onEngaged?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear composer on successful add — watch the whole state object so successive
  // sends (both returning success: true) each trigger a clear.
  useEffect(() => {
    if (addState.success) setComposerText("");
  }, [addState]);

  useEffect(() => {
    if (editState.success) {
      setEditingNote(null);
      setComposerText("");
      setShowEditSuccess(true);
      const t = setTimeout(() => setShowEditSuccess(false), 3000);
      return () => clearTimeout(t);
    }
  }, [editState]);

  useEffect(() => {
    if (deleteState.success) setConfirmDeleteId(null);
  }, [deleteState]);

  function startEdit(note: NoteEntry) {
    setEditingNote(note);
    setComposerText(note.body);
    setConfirmDeleteId(null);
    setShowEditSuccess(false);
  }

  function cancelEdit() {
    setEditingNote(null);
    setComposerText("");
  }

  const canEdit = (note: NoteEntry) => note.sender_id === currentUserId;
  const canDelete = (note: NoteEntry) => note.sender_id === currentUserId || isAdmin;

  return (
    <div className="h-full flex flex-col">
      {/* Message feed — column-reverse gives true bottom-anchored chat behavior.
          notes[0] (newest) sits at the visual bottom; older messages stack upward.
          No JavaScript scroll needed — the browser anchors overflow at the bottom. */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 pr-0.5" onScroll={onEngaged}>
        {notes.length === 0 ? (
          <p className="text-[10px] text-faint italic py-1">No messages yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="group">

              {/* Inline delete confirmation */}
              {confirmDeleteId === note.id ? (
                <div className="flex items-center justify-between rounded-lg px-2 py-1.5 bg-surface">
                  <span className="text-[9px] font-medium text-red-500">Delete this message?</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="p-0.5 rounded text-muted hover:text-ink hover:bg-wash transition-colors"
                      title="Cancel"
                    >
                      <XIcon />
                    </button>
                    <form action={deleteAction} className="inline-flex">
                      <input type="hidden" name="note_id" value={note.id} />
                      <input type="hidden" name="revalidate_path" value={revalidatePath} />
                      <button
                        type="submit"
                        className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Confirm delete"
                      >
                        <TrashIcon />
                      </button>
                    </form>
                  </div>
                  {deleteState.error && (
                    <p className="text-[9px] text-red-500 mt-0.5">{deleteState.error}</p>
                  )}
                </div>
              ) : (
                /* Normal message row */
                <div className="flex gap-1.5 items-start">
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-1">
                    <UserAvatar displayName={note.sender_label} size="xs" />
                  </div>

                  {/* Bubble */}
                  <div className="flex-1 min-w-0 rounded-xl px-2 py-1.5" style={{ background: "#f0f4f7" }}>
                    {/* Name row + action icons */}
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="text-[11px] font-semibold text-ink leading-tight truncate">
                        {note.sender_label}
                      </p>
                      {/* Action icons — visible on hover */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {canEdit(note) && (
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            className="p-0.5 rounded text-faint hover:text-primary hover:bg-primary-soft transition-colors"
                            title="Edit message"
                          >
                            <PenIcon />
                          </button>
                        )}
                        {canDelete(note) && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(note.id)}
                            className="p-0.5 rounded text-faint hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete message"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Message body — whitespace-pre-wrap preserves line breaks */}
                    <p className="text-xs text-ink leading-snug break-words whitespace-pre-wrap">{note.body}</p>

                    {/* Timestamp */}
                    <p
                      className="text-[9px] text-faint mt-0 text-right"
                      title={formatFullDateTime(note.created_at)}
                    >
                      {formatSmartDate(note.created_at)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Composer — anchored at bottom */}
      <div style={{ borderTop: "1px solid #e3e9ec" }} className="flex-shrink-0 pt-2">
        {editingNote ? (
          <form action={editAction}>
            <input type="hidden" name="note_id" value={editingNote.id} />
            <input type="hidden" name="revalidate_path" value={revalidatePath} />
            <textarea
              name="body"
              rows={3}
              required
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              className="w-full text-[11px] text-ink bg-card rounded-md px-2 py-1.5 resize-none outline-none"
              style={{ border: "1px solid #d4dde4" }}
              placeholder="Edit message…"
            />
            <EditButton isDirty={isDirty} />
            <button
              type="button"
              onClick={cancelEdit}
              className="mt-1 block w-full text-center text-[10px] text-primary hover:underline"
            >
              Cancel
            </button>
            {editState.error && (
              <p className="mt-1 text-[10px] text-red-600">{editState.error}</p>
            )}
          </form>
        ) : (
          <form action={addAction}>
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="revalidate_path" value={revalidatePath} />
            <textarea
              name="body"
              rows={3}
              required
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onFocus={onEngaged}
              className="w-full text-[11px] text-ink bg-card rounded-md px-2 py-1.5 resize-none outline-none"
              style={{ border: "1px solid #d4dde4" }}
              placeholder="Message the project team…"
            />
            <AddButton />
            {addState.error && (
              <p className="mt-1 text-[10px] text-red-600">{addState.error}</p>
            )}
          </form>
        )}
        {showEditSuccess && !editingNote && (
          <p className="mt-1 text-[10px] text-emerald-600">Changes made</p>
        )}
      </div>
    </div>
  );
}
