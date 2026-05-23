"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  createPricingRule,
  updatePricingRule,
  type PricingActionState,
} from "@/app/(admin)/admin/settings/pricing/actions";
import type { PricingRule } from "@/lib/queries/pricing";
import { Select, type SelectOption } from "@/components/ui/Select";

const AUTHORITY_OPTIONS: SelectOption[] = [
  { value: "", label: "Any" },
  { value: "state", label: "State" },
  { value: "county", label: "County" },
  { value: "municipal", label: "Municipal" },
];

const WORK_TYPE_OPTIONS: SelectOption[] = [
  { value: "", label: "Any" },
  { value: "aerial", label: "Aerial" },
  { value: "underground", label: "Underground" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const STATE_OPTIONS: SelectOption[] = [
  { value: "", label: "Any state" },
  ...US_STATES.map((s) => ({ value: s, label: s })),
];

const NJ_COUNTIES = [
  "Atlantic", "Bergen", "Burlington", "Camden", "Cape May", "Cumberland",
  "Essex", "Gloucester", "Hudson", "Hunterdon", "Mercer", "Middlesex",
  "Monmouth", "Morris", "Ocean", "Passaic", "Salem", "Somerset",
  "Sussex", "Union", "Warren",
];

const NJ_COUNTY_OPTIONS: SelectOption[] = [
  { value: "", label: "Any county" },
  ...NJ_COUNTIES.map((c) => ({ value: c, label: c })),
];

type CompanyOption = { id: string; name: string };

type Props = {
  item?: PricingRule;
  cancelHref: string;
  companies: CompanyOption[];
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

const inputCls =
  "w-full bg-surface rounded-lg px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow focus:ring-2 focus:ring-primary/20";
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

function FeeMarkupRow({
  label,
  includeName,
  markupName,
  percentName,
  initialInclude,
  initialMarkup,
  initialPercent,
}: {
  label: string;
  includeName: string;
  markupName: string;
  percentName: string;
  initialInclude: boolean;
  initialMarkup: boolean;
  initialPercent: number;
}) {
  const [include, setInclude] = useState(initialInclude);
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name={includeName}
          checked={include}
          onChange={(e) => setInclude(e.target.checked)}
          className="w-4 h-4 rounded accent-primary"
        />
        <p className="text-sm text-ink">{label}</p>
      </label>
      {include && (
        <div className="ml-7 flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name={markupName}
              defaultChecked={initialMarkup}
              className="w-4 h-4 rounded accent-primary"
            />
            <span className="text-xs text-dim">Apply markup</span>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              name={percentName}
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={initialPercent}
              className="w-20 bg-surface rounded-lg px-2 py-1.5 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
              style={inputStyle}
            />
            <span className="text-xs text-muted">%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function PricingForm({ item, cancelHref, companies }: Props) {
  const isEdit = !!item;
  const action = isEdit ? updatePricingRule : createPricingRule;
  const [state, formAction] = useActionState(action, initialState);

  // Controlled state for the four custom Select components + the cascading
  // county. Each Select reads `value` from state and writes through its
  // `onChange` so the form's hidden input always reflects the latest pick.
  const [companyId, setCompanyId] = useState<string>(item?.company_id ?? "");
  const [workType, setWorkType] = useState<string>(item?.work_type ?? "");
  const [selectedState, setSelectedState] = useState<string>(item?.state ?? "");
  const [authorityType, setAuthorityType] = useState<string>(item?.authority_type ?? "");
  const [county, setCounty] = useState<string>(item?.county ?? "");

  const companyOptions: SelectOption[] = [
    { value: "", label: "Any company" },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  const handleStateChange = (next: string) => {
    setSelectedState(next);
    // Reset county when the state changes — the available options (or the
    // free-text expectations) shift.
    if (next !== selectedState) setCounty("");
  };

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
          <Field label="Company">
            <Select
              name="company_id"
              value={companyId}
              onChange={setCompanyId}
              options={companyOptions}
            />
          </Field>
          <Field label="Work Type">
            <Select
              name="work_type"
              value={workType}
              onChange={setWorkType}
              options={WORK_TYPE_OPTIONS}
            />
          </Field>
          <Field label="State">
            <Select
              name="state"
              value={selectedState}
              onChange={handleStateChange}
              options={STATE_OPTIONS}
            />
          </Field>
          <Field label="County">
            {selectedState === "NJ" ? (
              <Select
                name="county"
                value={county}
                onChange={setCounty}
                options={NJ_COUNTY_OPTIONS}
              />
            ) : (
              <input
                name="county"
                type="text"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                placeholder="e.g. Bergen"
                className={inputCls}
                style={inputStyle}
              />
            )}
          </Field>
          <Field label="Authority Type">
            <Select
              name="authority_type"
              value={authorityType}
              onChange={setAuthorityType}
              options={AUTHORITY_OPTIONS}
            />
          </Field>
        </div>
      </div>

      {/* Pricing Factors */}
      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Pricing Factors</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Base Project Fee">
            <DecInput name="base_project_fee" defaultValue={item?.base_project_fee} />
          </Field>
          <Field label="Per Sheet Fee">
            <DecInput name="per_sheet_fee" defaultValue={item?.per_sheet_fee} />
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
        <p className="text-xs text-muted mb-4">
          Toggle each fee independently. When a fee is included, an optional admin markup can be applied
          on top — billed as a separate line item on the invoice.
        </p>
        <div className="space-y-4">
          <FeeMarkupRow
            label="Include Application Fee"
            includeName="include_application_fee"
            markupName="application_fee_markup"
            percentName="application_fee_markup_percent"
            initialInclude={item?.include_application_fee ?? false}
            initialMarkup={item?.application_fee_markup ?? true}
            initialPercent={item?.application_fee_markup_percent ?? 10}
          />
          <FeeMarkupRow
            label="Include Permit Fee"
            includeName="include_permit_fee"
            markupName="permit_fee_markup"
            percentName="permit_fee_markup_percent"
            initialInclude={item?.include_permit_fee ?? false}
            initialMarkup={item?.permit_fee_markup ?? true}
            initialPercent={item?.permit_fee_markup_percent ?? 10}
          />
          <FeeMarkupRow
            label="Include Review Fee"
            includeName="include_review_fee"
            markupName="review_fee_markup"
            percentName="review_fee_markup_percent"
            initialInclude={item?.include_review_fee ?? false}
            initialMarkup={item?.review_fee_markup ?? true}
            initialPercent={item?.review_fee_markup_percent ?? 10}
          />
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
