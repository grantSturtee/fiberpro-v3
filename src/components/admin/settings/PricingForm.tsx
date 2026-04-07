"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  createPricingRule,
  updatePricingRule,
  type PricingActionState,
} from "@/app/(admin)/admin/settings/pricing/actions";
import type { PricingRule } from "@/lib/queries/pricing";

const AUTHORITY_OPTIONS = [
  { value: "county", label: "County" },
  { value: "njdot", label: "NJDOT (State)" },
  { value: "municipal", label: "Municipal" },
  { value: "other", label: "Other" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

type Props = {
  item?: PricingRule;
  cancelHref: string;
};

const initialState: PricingActionState = { error: null };

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
    >
      {pending ? "Saving…" : isEdit ? "Save Changes" : "Create Rule"}
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-dim mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
const inputStyle = { border: "1px solid #d4dde4" };

function DecInput({ name, defaultValue, placeholder }: { name: string; defaultValue?: number | null; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
      <input
        name={name}
        type="number"
        step="0.01"
        min="0"
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder ?? "0.00"}
        className={`${inputCls} pl-7`}
        style={inputStyle}
      />
    </div>
  );
}

function MultiplierInput({ name, defaultValue }: { name: string; defaultValue?: number }) {
  return (
    <input
      name={name}
      type="number"
      step="0.01"
      min="0.01"
      defaultValue={defaultValue ?? 1}
      className={inputCls}
      style={inputStyle}
    />
  );
}

export function PricingForm({ item, cancelHref }: Props) {
  const isEdit = !!item;
  const action = isEdit ? updatePricingRule : createPricingRule;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-7">
      {isEdit && <input type="hidden" name="id" value={item.id} />}

      {/* Identification */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Identification</p>
        <Field label="Rule Name *">
          <input
            name="name"
            type="text"
            required
            defaultValue={item?.name ?? ""}
            placeholder="e.g. NJ Bergen County — Aerial"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
      </div>

      {/* Scope */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Scope</p>
        <p className="text-xs text-muted mb-4">
          Leave fields blank to act as wildcards. A rule with only State set applies to all projects in that state.
          The most specific matching rule wins.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="State">
            <select name="state" defaultValue={item?.state ?? ""} className={inputCls} style={inputStyle}>
              <option value="">Any state</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="County">
            <input
              name="county"
              type="text"
              defaultValue={item?.county ?? ""}
              placeholder="e.g. Bergen"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="Authority Type">
            <select name="authority_type" defaultValue={item?.authority_type ?? ""} className={inputCls} style={inputStyle}>
              <option value="">Any</option>
              {AUTHORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Pricing Factors */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Pricing Factors</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Base Project Fee">
            <DecInput name="base_project_fee" defaultValue={item?.base_project_fee} />
          </Field>
          <Field label="Per Sheet Fee">
            <DecInput name="per_sheet_fee" defaultValue={item?.per_sheet_fee} />
          </Field>
          <Field label="Per Mile Fee" hint="Optional">
            <DecInput name="per_mile_fee" defaultValue={item?.per_mile_fee} />
          </Field>
          <Field label="Rush Fee" hint="Added to total when applicable">
            <DecInput name="rush_fee" defaultValue={item?.rush_fee} />
          </Field>
        </div>
      </div>

      {/* Multipliers */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Plan-Type Multipliers</p>
        <p className="text-xs text-muted mb-4">
          Applied to the base + sheet subtotal based on the project&apos;s plan type. 1 = no change.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Aerial Multiplier">
            <MultiplierInput name="aerial_multiplier" defaultValue={item?.aerial_multiplier} />
          </Field>
          <Field label="Underground Multiplier">
            <MultiplierInput name="underground_multiplier" defaultValue={item?.underground_multiplier} />
          </Field>
          <Field label="Complexity Multiplier">
            <MultiplierInput name="complexity_multiplier" defaultValue={item?.complexity_multiplier} />
          </Field>
        </div>
      </div>

      {/* Fees */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Fee Pass-Throughs</p>
        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="include_application_fee"
              defaultChecked={item?.include_application_fee ?? false}
              className="w-4 h-4 rounded accent-primary"
            />
            <div>
              <p className="text-sm text-ink">Include application fee from jurisdiction</p>
              <p className="text-xs text-muted">Adds the matched jurisdiction&apos;s application_fee to the estimate.</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="include_jurisdiction_fee"
              defaultChecked={item?.include_jurisdiction_fee ?? false}
              className="w-4 h-4 rounded accent-primary"
            />
            <div>
              <p className="text-sm text-ink">Include jurisdiction fee from jurisdiction</p>
              <p className="text-xs text-muted">Adds the matched jurisdiction&apos;s jurisdiction_fee to the estimate.</p>
            </div>
          </label>
        </div>
        <div className="max-w-xs">
          <Field label="FiberPro Admin Fee" hint="Added after multipliers are applied.">
            <DecInput name="fiberpro_admin_fee" defaultValue={item?.fiberpro_admin_fee} />
          </Field>
        </div>
      </div>

      {/* Conditions */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Conditions</p>
        <p className="text-xs text-muted mb-4">
          Optional sheet count gate. Leave blank to apply to any project.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Min Sheets">
            <input
              name="min_sheets"
              type="number"
              min="0"
              defaultValue={item?.min_sheets ?? ""}
              placeholder="—"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="Max Sheets">
            <input
              name="max_sheets"
              type="number"
              min="0"
              defaultValue={item?.max_sheets ?? ""}
              placeholder="—"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <Link href={cancelHref} className="text-sm text-muted hover:text-dim transition-colors">
          Cancel
        </Link>
        <SubmitButton isEdit={isEdit} />
      </div>
    </form>
  );
}
