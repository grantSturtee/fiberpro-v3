"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  removeTeamMember,
  inviteTeamMember,
  type TeamActionState,
} from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssignmentEntry = {
  id: string;
  projectId: string;
  jobNumber: string;
  jobName: string;
};

export type ProjectOption = {
  id: string;
  jobNumber: string;
  jobName: string;
};

export type MemberEntry = {
  membershipId: string;
  userId: string;
  role: string;
  displayName: string | null;
  email: string | null;
  isSelf: boolean;
  assignments: AssignmentEntry[];
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 14,4" />
      <path d="M5,4V2h6v2" />
      <path d="M3,4l1,10h8l1-10" />
    </svg>
  );
}

// ── Icon link/button helpers ──────────────────────────────────────────────────

function IconLink({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="p-1 rounded text-faint hover:text-primary hover:bg-primary-soft transition-colors"
    >
      {children}
    </Link>
  );
}

function IconButton({
  title,
  danger = false,
  children,
}: {
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      title={title}
      className={`p-1 rounded transition-colors ${
        danger
          ? "text-faint hover:text-red-500 hover:bg-red-50"
          : "text-faint hover:text-primary hover:bg-primary-soft"
      }`}
    >
      {children}
    </button>
  );
}

// ── Member name + badge display ───────────────────────────────────────────────

function MemberName({
  displayName,
  email,
  isSelf,
  tag,
}: {
  displayName: string | null;
  email: string | null;
  isSelf: boolean;
  tag?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="text-sm font-medium text-ink">{displayName ?? email ?? "Unknown"}</p>
        {isSelf && (
          <span className="text-[10px] font-semibold bg-primary-soft text-primary rounded px-1.5 py-0.5">
            You
          </span>
        )}
        {tag && (
          <span className="text-[10px] font-medium bg-wash text-muted rounded px-1.5 py-0.5">
            {tag}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Row actions: eye + pencil + optional trash ────────────────────────────────

function RowActions({
  userId,
  membershipId,
  showTrash,
}: {
  userId: string;
  membershipId: string;
  showTrash: boolean;
}) {
  const [removeState, removeAction] = useActionState<TeamActionState, FormData>(
    removeTeamMember,
    { error: null }
  );

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <IconLink href={`/company/team/${userId}`} title="View user">
        <EyeIcon />
      </IconLink>
      <IconLink href={`/company/team/${userId}/edit`} title="Edit user">
        <PencilIcon />
      </IconLink>
      {showTrash && (
        <form action={removeAction}>
          <input type="hidden" name="membership_id" value={membershipId} />
          <IconButton title="Remove from team" danger>
            <TrashIcon />
          </IconButton>
        </form>
      )}
      {removeState.error && (
        <p className="text-xs text-red-600 ml-1">{removeState.error}</p>
      )}
    </div>
  );
}

// ── Company Admin row — view/edit allowed, no trash ───────────────────────────

export function CompanyAdminRow({
  member,
  isLastAdmin: _isLastAdmin,
}: {
  member: MemberEntry;
  isLastAdmin: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <MemberName
        displayName={member.displayName}
        email={member.email}
        isSelf={member.isSelf}
      />
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <IconLink href={`/company/team/${member.userId}`} title="View user">
          <EyeIcon />
        </IconLink>
        <IconLink href={`/company/team/${member.userId}/edit`} title="Edit user">
          <PencilIcon />
        </IconLink>
      </div>
    </div>
  );
}

// ── PM row ────────────────────────────────────────────────────────────────────

export function PMRow({ member }: { member: MemberEntry }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-4">
        <MemberName
          displayName={member.displayName}
          email={member.email}
          isSelf={member.isSelf}
          tag="PM"
        />
        <RowActions
          userId={member.userId}
          membershipId={member.membershipId}
          showTrash
        />
      </div>
    </div>
  );
}

// ── Add User form ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AddSubmitButton({ canAdd }: { canAdd: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || !canAdd;
  return (
    <button
      type="submit"
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
      style={
        !disabled
          ? { background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)", color: "white" }
          : { background: "#e3e9ec", color: "#9ba8b4" }
      }
    >
      {pending ? "Adding…" : "Add User"}
    </button>
  );
}

export function AddUserForm() {
  const [state, formAction] = useActionState<TeamActionState, FormData>(inviteTeamMember, {
    error: null,
  });
  const [nameValue, setNameValue] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");

  const canAdd =
    nameValue.trim().length > 0 &&
    EMAIL_RE.test(emailValue) &&
    passwordValue.length >= 8;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="role" value="project_manager" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
            Display Name
          </label>
          <input
            name="display_name"
            type="text"
            required
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            className="w-full text-sm text-ink bg-surface rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
            Email
          </label>
          <input
            name="email"
            type="email"
            required
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            className="w-full text-sm text-ink bg-surface rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
            placeholder="jane@example.com"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
            Password{" "}
            <span className="normal-case font-normal tracking-normal text-faint">
              (new users only)
            </span>
          </label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
            className="w-full text-sm text-ink bg-surface rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
            placeholder="Min. 8 characters"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {state.error ? (
          <p className="text-xs text-red-600">{state.error}</p>
        ) : state.success ? (
          <p className="text-xs text-emerald-700">User added successfully.</p>
        ) : (
          <span />
        )}
        <AddSubmitButton canAdd={canAdd} />
      </div>
    </form>
  );
}

export { AddUserForm as InviteForm };
