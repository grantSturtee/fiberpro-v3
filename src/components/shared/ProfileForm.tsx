"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { UserAvatar } from "@/components/shared/UserAvatar";

export type UpdateOwnProfileState = {
  error: string | null;
  success?: boolean;
};

type Props = {
  user: {
    display_name: string;
    email: string;
    avatarUrl?: string | null;
  };
  action: (
    prevState: UpdateOwnProfileState,
    formData: FormData
  ) => Promise<UpdateOwnProfileState>;
};

const inputCls =
  "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
const borderStyle = { border: "1px solid #d4dde4" };
const labelCls = "block text-xs font-medium text-dim mb-1.5";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Saving…" : "Save Changes"}
    </button>
  );
}

export function ProfileForm({ user, action }: Props) {
  const [state, formAction] = useActionState(action, { error: null });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <form className="space-y-5" action={formAction}>

      {/* Avatar preview + upload */}
      <div className="flex items-center gap-4 pb-5" style={{ borderBottom: "1px solid #e3e9ec" }}>
        <UserAvatar
          displayName={user.display_name || user.email}
          avatarUrl={previewUrl ?? user.avatarUrl}
          size="lg"
        />
        <div>
          <label
            className="cursor-pointer inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium text-ink bg-canvas hover:bg-wash transition-colors"
            style={borderStyle}
          >
            Upload photo
            <input
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
          <p className="mt-1.5 text-xs text-muted">JPEG, PNG or WebP</p>
        </div>
      </div>

      {/* Account fields */}
      <div className="space-y-4">
        <div>
          <label className={labelCls}>
            Display Name<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            name="display_name"
            type="text"
            required
            defaultValue={user.display_name}
            className={inputCls}
            style={borderStyle}
          />
        </div>

        <div>
          <label className={labelCls}>Email</label>
          <p className="text-sm text-ink px-3.5 py-2.5 bg-canvas rounded-lg" style={borderStyle}>
            {user.email}
          </p>
        </div>
      </div>

      {/* Password change */}
      <div style={{ borderTop: "1px solid #e3e9ec" }} className="pt-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Change Password</p>
          <p className="mt-0.5 text-xs text-muted">Leave both fields blank to keep your current password.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>New Password</label>
            <input
              name="new_password"
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              className={inputCls}
              style={borderStyle}
            />
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <input
              name="confirm_new_password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter new password"
              className={inputCls}
              style={borderStyle}
            />
          </div>
        </div>
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      {state.success && (
        <div className="rounded-lg bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700">Profile updated.</p>
        </div>
      )}

      <div className="flex justify-end pt-2" style={{ borderTop: "1px solid #e3e9ec" }}>
        <SubmitButton />
      </div>
    </form>
  );
}
