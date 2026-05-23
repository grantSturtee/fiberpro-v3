"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateGlobalSetting,
  type GlobalSettingActionState,
} from "@/app/(admin)/admin/settings/pricing/global-actions";
import { Select } from "@/components/ui/Select";

const initialState: GlobalSettingActionState = { error: null };

function fmtMoney(s: string): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  return `$${n.toFixed(2)}`;
}

function SaveBtn({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function FeedbackLine({ state }: { state: GlobalSettingActionState }) {
  if (state.error) return <p className="text-[11px] text-red-600">{state.error}</p>;
  if (state.success) return <p className="text-[11px] text-emerald-700">Saved.</p>;
  return null;
}

// ── Default Admin Fee ────────────────────────────────────────────────────────

function DefaultAdminFeeForm({ currentValue }: { currentValue: string }) {
  const [state, formAction] = useActionState(updateGlobalSetting, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="key" value="default_admin_fee" />
      <div className="flex items-end gap-2 flex-wrap">
        <div className="relative w-32">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
          <input
            name="value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={currentValue}
            className="w-full bg-surface rounded-lg pl-7 pr-3 py-1.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
          />
        </div>
        <SaveBtn />
      </div>
      <FeedbackLine state={state} />
    </form>
  );
}

// ── Rush Fee (type + value, two separate forms) ──────────────────────────────

function RushFeeTypeForm({ currentValue }: { currentValue: string }) {
  const [state, formAction] = useActionState(updateGlobalSetting, initialState);
  const [type, setType] = useState<string>(currentValue);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="key" value="rush_fee_type" />
      <input type="hidden" name="value" value={type} />
      <div className="flex items-end gap-2 flex-wrap">
        <div className="w-40">
          <Select
            name="rush_fee_type_display"
            value={type}
            onChange={setType}
            options={[
              { value: "percent", label: "Percent" },
              { value: "fixed", label: "Fixed Amount" },
            ]}
          />
        </div>
        <SaveBtn label="Save Type" />
      </div>
      <FeedbackLine state={state} />
    </form>
  );
}

function RushFeeValueForm({ currentValue, currentType }: { currentValue: string; currentType: string }) {
  const [state, formAction] = useActionState(updateGlobalSetting, initialState);
  const symbol = currentType === "fixed" ? "$" : "%";
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="key" value="rush_fee_value" />
      <div className="flex items-end gap-2 flex-wrap">
        <div className="relative w-32">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{symbol}</span>
          <input
            name="value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={currentValue}
            className="w-full bg-surface rounded-lg pl-7 pr-3 py-1.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            style={{ border: "1px solid #d4dde4" }}
          />
        </div>
        <SaveBtn label="Save Value" />
      </div>
      <FeedbackLine state={state} />
    </form>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function GlobalSettingsCard({
  defaultAdminFee,
  rushFeeType,
  rushFeeValue,
}: {
  defaultAdminFee: string;
  rushFeeType: string;
  rushFeeValue: string;
}) {
  const rushDisplay =
    rushFeeType === "fixed" ? fmtMoney(rushFeeValue) : `${parseFloat(rushFeeValue || "0")}%`;

  return (
    <div className="bg-card rounded-xl p-6 space-y-6" style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}>
      <div>
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Global Settings</h2>
        <p className="text-xs text-muted mt-0.5">
          Fallback values used when a specific pricing rule doesn&apos;t set its own.
        </p>
      </div>

      {/* Default Admin Fee */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <div>
            <p className="text-sm font-medium text-ink">Default Admin Fee</p>
            <p className="text-[11px] text-muted">Used when a matched rule&apos;s admin fee is $0.</p>
          </div>
          <p className="text-sm font-mono text-dim">Current: {fmtMoney(defaultAdminFee)}</p>
        </div>
        <DefaultAdminFeeForm currentValue={defaultAdminFee} />
      </div>

      <div className="border-t border-surface" />

      {/* Rush Fee */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-medium text-ink">Rush Fee</p>
            <p className="text-[11px] text-muted">Applied to rush projects (type + value saved separately).</p>
          </div>
          <p className="text-sm font-mono text-dim">Current: {rushDisplay}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-medium text-dim mb-1.5">Type</p>
            <RushFeeTypeForm currentValue={rushFeeType} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-dim mb-1.5">Value</p>
            <RushFeeValueForm currentValue={rushFeeValue} currentType={rushFeeType} />
          </div>
        </div>
      </div>
    </div>
  );
}
