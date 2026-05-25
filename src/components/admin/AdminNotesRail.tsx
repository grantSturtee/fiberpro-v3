"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, Pencil, X } from "lucide-react";
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

// ── Buttons ───────────────────────────────────────────────────────────────────

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1.5 w-full px-2 py-1 rounded text-[11px] font-semibold text-white bg-[#1565C0] hover:bg-[#1251A3] disabled:opacity-50 transition-colors"
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
      className={`mt-1.5 w-full px-2 py-1 rounded text-[11px] font-semibold text-white transition-colors ${
        active ? "bg-[#1565C0] hover:bg-[#1251A3]" : "bg-[#E5E7EB] cursor-default"
      }`}
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

  const textareaClass =
    "w-full text-[14px] text-[#111827] bg-white rounded-md px-3 py-2 resize-none border border-[#D1D5DB] focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#EFF6FF] placeholder:text-[#9CA3AF]";

  return (
    <div className="h-full flex flex-col">
      {/* Message feed — column-reverse gives true bottom-anchored chat behavior.
          notes[0] (newest) sits at the visual bottom; older messages stack upward.
          No JavaScript scroll needed — the browser anchors overflow at the bottom. */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 pr-0.5" onScroll={onEngaged}>
        {notes.length === 0 ? (
          <p className="text-[10px] text-[#9CA3AF] italic py-1">No messages yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="group">

              {/* Inline delete confirmation */}
              {confirmDeleteId === note.id ? (
                <div className="flex items-center justify-between rounded-lg px-2 py-1.5 bg-[#F8F9FB]">
                  <span className="text-[9px] font-medium text-[#DC2626]">Delete this message?</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="p-0.5 rounded text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] transition-colors"
                      title="Cancel"
                    >
                      <X size={11} strokeWidth={1.75} />
                    </button>
                    <form action={deleteAction} className="inline-flex">
                      <input type="hidden" name="note_id" value={note.id} />
                      <input type="hidden" name="revalidate_path" value={revalidatePath} />
                      <button
                        type="submit"
                        className="p-0.5 rounded text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                        title="Confirm delete"
                      >
                        <Trash2 size={11} strokeWidth={1.5} />
                      </button>
                    </form>
                  </div>
                  {deleteState.error && (
                    <p className="text-[9px] text-[#DC2626] mt-0.5">{deleteState.error}</p>
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
                  <div className="flex-1 min-w-0 rounded-xl px-2 py-1.5" style={{ background: "#F3F4F6" }}>
                    {/* Name row + action icons */}
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="text-[11px] font-semibold text-[#111827] leading-tight truncate">
                        {note.sender_label}
                      </p>
                      {/* Action icons — visible on hover */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {canEdit(note) && (
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            className="p-0.5 rounded text-[#9CA3AF] hover:text-[#1565C0] hover:bg-[#E8F0FE] transition-colors"
                            title="Edit message"
                          >
                            <Pencil size={11} strokeWidth={1.5} />
                          </button>
                        )}
                        {canDelete(note) && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(note.id)}
                            className="p-0.5 rounded text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                            title="Delete message"
                          >
                            <Trash2 size={11} strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Message body — whitespace-pre-wrap preserves line breaks */}
                    <p className="text-xs text-[#111827] leading-snug break-words whitespace-pre-wrap">{note.body}</p>

                    {/* Timestamp */}
                    <p
                      className="text-[9px] text-[#9CA3AF] mt-0 text-right"
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
      <div className="flex-shrink-0 pt-2" style={{ borderTop: "1px solid #E5E7EB" }}>
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
              className={textareaClass}
              placeholder="Edit message…"
            />
            <EditButton isDirty={isDirty} />
            <button
              type="button"
              onClick={cancelEdit}
              className="mt-1 block w-full text-center text-[10px] text-[#1565C0] hover:underline"
            >
              Cancel
            </button>
            {editState.error && (
              <p className="mt-1 text-[10px] text-[#DC2626]">{editState.error}</p>
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
              className={textareaClass}
              placeholder="Message the project team…"
            />
            <AddButton />
            {addState.error && (
              <p className="mt-1 text-[10px] text-[#DC2626]">{addState.error}</p>
            )}
          </form>
        )}
        {showEditSuccess && !editingNote && (
          <p className="mt-1 text-[10px] text-[#16A34A]">Changes made</p>
        )}
      </div>
    </div>
  );
}
