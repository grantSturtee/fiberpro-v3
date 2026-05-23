"use client";

import { useState, startTransition, useRef, useEffect } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { updateBlueprintSlots, type BlueprintActionState } from "../actions";
import { SectionCard } from "@/components/ui/SectionCard";

type PageTemplate = { id: string; name: string };
type BlueprintStatus = "draft" | "active" | "inactive";

const initial: BlueprintActionState = { error: null };

// ── Primitives ────────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
        checked ? "bg-primary" : "bg-rule"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function PositionCircle({
  position,
  configured,
}: {
  position: number;
  configured: boolean;
}) {
  return (
    <span
      className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
        configured
          ? "bg-green-100 text-green-700 border border-green-200"
          : "bg-blue-50 text-blue-600 border border-blue-200"
      }`}
    >
      {position}
    </span>
  );
}

function MissingDot() {
  return (
    <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
  );
}

function CompletionChip({
  label,
  configured,
}: {
  label: string;
  configured: boolean;
}) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-green-50 text-green-700 rounded-full px-2 py-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-blue-50 text-blue-600 rounded-full px-2 py-0.5">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />
      {label}
    </span>
  );
}

// ── Work type interactive badge ───────────────────────────────────────────────

const WORK_TYPE_OPTIONS = ["aerial", "underground", "mixed", "other"] as const;

function WorkTypeBadgeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors ${
          value
            ? "text-dim bg-surface border border-rule hover:bg-rule capitalize"
            : "text-amber-700 bg-amber-50 hover:bg-amber-100"
        }`}
      >
        {value || "No work type"}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-canvas border border-rule rounded-lg shadow-sm z-10 min-w-[120px] overflow-hidden">
          {WORK_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`block w-full px-3 py-1.5 text-left text-sm transition-colors capitalize ${
                value === opt ? "bg-surface text-ink font-medium" : "text-ink hover:bg-surface"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Active / Inactive switch (local-state only, no confirm) ───────────────────

function ActiveInactiveSwitch({
  value,
  onChange,
}: {
  value: "active" | "inactive";
  onChange: (v: "active" | "inactive") => void;
}) {
  return (
    <div className="flex rounded-lg border border-rule overflow-hidden text-xs font-semibold">
      <button
        type="button"
        onClick={() => onChange("active")}
        className={`px-3 py-1.5 transition-colors ${
          value === "active"
            ? "bg-green-500 text-white cursor-default"
            : "bg-canvas text-dim hover:bg-surface"
        }`}
      >
        Active
      </button>
      <button
        type="button"
        onClick={() => onChange("inactive")}
        className={`px-3 py-1.5 border-l border-rule transition-colors ${
          value === "inactive"
            ? "bg-amber-500 text-white cursor-default"
            : "bg-canvas text-dim hover:bg-surface"
        }`}
      >
        Inactive
      </button>
    </div>
  );
}

// ── Row layouts ───────────────────────────────────────────────────────────────

function SlotRow({
  position,
  label,
  configured,
  error,
  children,
}: {
  position: number;
  label: string;
  configured: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <PositionCircle position={position} configured={configured} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
              {!configured && <MissingDot />}
              {label}
            </span>
            <div className="flex-shrink-0 flex items-center gap-2">{children}</div>
          </div>
        </div>
      </div>
      {error && <p className="mt-1.5 ml-8 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function RequiredByAuthorityBadge() {
  return (
    <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
      Required by authority
    </span>
  );
}

function AddonToggleRow({
  label,
  included,
  incomplete,
  onToggle,
  error,
  authorityRequired = false,
  authorityWarning,
  children,
}: {
  label: string;
  included: boolean;
  incomplete: boolean;
  onToggle: (v: boolean) => void;
  error?: string;
  authorityRequired?: boolean;
  authorityWarning?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        {authorityRequired ? (
          // When the parent authority requires this document, the toggle is
          // forced ON and locked. The admin must select a template (or leave
          // the slot empty as a draft) — they cannot opt out of the document.
          <span
            className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent bg-primary opacity-70"
            aria-label="Required by authority — toggle locked"
            title="Required by authority — toggle locked"
          >
            <span className="inline-block h-4 w-4 translate-x-4 rounded-full bg-white shadow" />
          </span>
        ) : (
          <ToggleSwitch checked={included} onChange={onToggle} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
              {incomplete && <MissingDot />}
              {label}
              {authorityRequired && <RequiredByAuthorityBadge />}
            </span>
            <div className="flex-shrink-0 flex items-center gap-2">
              {included ? children : (
                <span className="text-xs text-faint">Not included</span>
              )}
            </div>
          </div>
        </div>
      </div>
      {authorityRequired && authorityWarning && (
        <p className="mt-1.5 ml-8 text-xs text-blue-700">{authorityWarning}</p>
      )}
      {error && <p className="mt-1.5 ml-8 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function TemplateSelect({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: PageTemplate[];
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-rule bg-canvas px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      <option value="">Select</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function BlueprintRecipeForm({
  blueprintId,
  description,
  workType,
  currentStatus,
  coverPageTemplateId,
  appPageTemplateId,
  certPageTemplateId,
  tcpWrapperId,
  tcdWrapperId,
  sldWrapperId,
  coiTemplateId,
  coverOptions,
  applicationOptions,
  certificationOptions,
  tcpOptions,
  tcdOptions,
  sldOptions,
  coiOptions,
  authorityRequiresApp = false,
  authorityRequiresCert = false,
  authorityRequiresCoi = false,
}: {
  blueprintId: string;
  description: string | null;
  workType: string | null;
  currentStatus: BlueprintStatus;
  coverPageTemplateId: string | null;
  appPageTemplateId: string | null;
  certPageTemplateId: string | null;
  tcpWrapperId: string | null;
  tcdWrapperId: string | null;
  sldWrapperId: string | null;
  coiTemplateId: string | null;
  coverOptions: PageTemplate[];
  applicationOptions: PageTemplate[];
  certificationOptions: PageTemplate[];
  tcpOptions: PageTemplate[];
  tcdOptions: PageTemplate[];
  sldOptions: PageTemplate[];
  coiOptions: PageTemplate[];
  authorityRequiresApp?: boolean;
  authorityRequiresCert?: boolean;
  authorityRequiresCoi?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateBlueprintSlots, initial);

  const isNonDraft = currentStatus !== "draft";

  // Required slots
  const [workTypeVal, setWorkTypeVal] = useState(workType ?? "");
  const [coverId, setCoverId] = useState(coverPageTemplateId ?? "");
  const [tcpId,   setTcpId]   = useState(tcpWrapperId ?? "");
  const [tcdId,   setTcdId]   = useState(tcdWrapperId ?? "");
  const [sldId,   setSldId]   = useState(sldWrapperId ?? "");

  // Active / inactive (only tracked for non-draft blueprints)
  const [statusVal, setStatusVal] = useState<"active" | "inactive">(
    currentStatus === "active" ? "active" : "inactive"
  );

  // Optional add-ons. When the parent authority requires a doc, force the
  // toggle ON so the slot is always submitted (admin can leave the dropdown
  // empty in draft, but cannot opt out of the document entirely).
  const [includeApp,  setIncludeApp]  = useState(appPageTemplateId  !== null || authorityRequiresApp);
  const [appId,       setAppId]       = useState(appPageTemplateId ?? "");
  const [includeCert, setIncludeCert] = useState(certPageTemplateId !== null || authorityRequiresCert);
  const [certId,      setCertId]      = useState(certPageTemplateId ?? "");
  const [includeCoi,  setIncludeCoi]  = useState(coiTemplateId      !== null || authorityRequiresCoi);
  const [coiId,       setCoiId]       = useState(coiTemplateId ?? "");

  // Client-side validation errors (only fire after a save attempt)
  const [valErrors, setValErrors] = useState<Record<string, string>>({});

  function clearValError(key: string) {
    setValErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // ── Dirty-state tracking ───────────────────────────────────────────────────
  type Snap = {
    workType: string;
    coverId: string; tcpId: string; tcdId: string; sldId: string;
    includeApp: boolean; appId: string;
    includeCert: boolean; certId: string;
    includeCoi: boolean; coiId: string;
    statusVal: "active" | "inactive";
  };

  const savedSnap = useRef<Snap>({
    workType:    workType ?? "",
    coverId:     coverPageTemplateId ?? "",
    tcpId:       tcpWrapperId ?? "",
    tcdId:       tcdWrapperId ?? "",
    sldId:       sldWrapperId ?? "",
    // Mirror the include* defaults so an authority-forced ON toggle doesn't
    // mark the form dirty on mount.
    includeApp:  appPageTemplateId  !== null || authorityRequiresApp,
    appId:       appPageTemplateId ?? "",
    includeCert: certPageTemplateId !== null || authorityRequiresCert,
    certId:      certPageTemplateId ?? "",
    includeCoi:  coiTemplateId      !== null || authorityRequiresCoi,
    coiId:       coiTemplateId ?? "",
    statusVal:   currentStatus === "active" ? "active" : "inactive",
  });

  const pendingSnap    = useRef<Snap | null>(null);
  const processedState = useRef<BlueprintActionState | null>(null);

  if (state.success && state !== processedState.current && pendingSnap.current) {
    processedState.current = state;
    savedSnap.current      = pendingSnap.current;
    pendingSnap.current    = null;
  }

  const s = savedSnap.current;
  const isDirty =
    workTypeVal !== s.workType    ||
    coverId     !== s.coverId     ||
    tcpId       !== s.tcpId       ||
    tcdId       !== s.tcdId       ||
    sldId       !== s.sldId       ||
    includeApp  !== s.includeApp  ||
    appId       !== s.appId       ||
    includeCert !== s.includeCert ||
    certId      !== s.certId      ||
    includeCoi  !== s.includeCoi  ||
    coiId       !== s.coiId       ||
    (isNonDraft && statusVal !== s.statusVal);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    // Authority-required slots: allow draft save with empty template (the
    // detail UI shows a "select before activating" warning, and the activation
    // action blocks status="active" until the slot is filled). Only the
    // optional, admin-toggled slots produce a hard "select or toggle off" error.
    if (includeApp  && !appId  && !authorityRequiresApp)  errors.app  = "Select a template or toggle off.";
    if (includeCert && !certId && !authorityRequiresCert) errors.cert = "Select a template or toggle off.";
    if (includeCoi  && !coiId  && !authorityRequiresCoi)  errors.coi  = "Select a template or toggle off.";
    if (Object.keys(errors).length > 0) {
      setValErrors(errors);
      return;
    }
    setValErrors({});
    pendingSnap.current = {
      workType: workTypeVal, coverId, tcpId, tcdId, sldId,
      includeApp, appId, includeCert, certId, includeCoi, coiId,
      statusVal,
    };
    const data = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="blueprint_id" value={blueprintId} />
      <input type="hidden" name="description"  value={description ?? ""} />
      <input type="hidden" name="work_type"    value={workTypeVal} />
      {isNonDraft && (
        <input type="hidden" name="new_status" value={statusVal} />
      )}

      {/* ── Work type badge + Active/Inactive row ────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Work type:</span>
          <WorkTypeBadgeSelect value={workTypeVal} onChange={setWorkTypeVal} />
        </div>
        {isNonDraft && (
          <ActiveInactiveSwitch value={statusVal} onChange={setStatusVal} />
        )}
      </div>

      {/* Reactive completeness chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted mr-1">Slots:</span>
        <CompletionChip label="Cover" configured={coverId !== ""} />
        <CompletionChip label="TCP"   configured={tcpId  !== ""} />
        <CompletionChip label="TCD"   configured={tcdId  !== ""} />
        <CompletionChip label="SLD"   configured={sldId  !== ""} />
        {includeApp  && <CompletionChip label="App Form"  configured={appId  !== ""} />}
        {includeCert && <CompletionChip label="Cert Form" configured={certId !== ""} />}
        {includeCoi  && <CompletionChip label="COI"       configured={coiId  !== ""} />}
      </div>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2.5">Saved.</p>
      )}

      {/* ── Required sections ────────────────────────────────────────────── */}
      <SectionCard title="Package Body — Required Sections">
        <div className="divide-y divide-surface">

          <SlotRow position={1} label="Cover Sheet" configured={coverId !== ""}>
            {coverOptions.length === 0 ? (
              <Link href="/admin/settings/page-templates" className="text-xs text-primary hover:underline">
                Add cover template →
              </Link>
            ) : (
              <TemplateSelect
                name="cover_page_template_id"
                value={coverId}
                onChange={setCoverId}
                options={coverOptions}
              />
            )}
          </SlotRow>

          <SlotRow position={2} label="TCP Wrapper" configured={tcpId !== ""}>
            {tcpOptions.length === 0 ? (
              <Link href="/admin/settings/page-templates" className="text-xs text-primary hover:underline">
                Add templates →
              </Link>
            ) : (
              <TemplateSelect
                name="tcp_wrapper_id"
                value={tcpId}
                onChange={setTcpId}
                options={tcpOptions}
              />
            )}
          </SlotRow>

          <SlotRow position={3} label="TCD Wrapper" configured={tcdId !== ""}>
            {tcdOptions.length === 0 ? (
              <Link href="/admin/settings/page-templates" className="text-xs text-primary hover:underline">
                Add templates →
              </Link>
            ) : (
              <TemplateSelect
                name="tcd_wrapper_id"
                value={tcdId}
                onChange={setTcdId}
                options={tcdOptions}
              />
            )}
          </SlotRow>

          <SlotRow position={4} label="SLD Wrapper" configured={sldId !== ""}>
            {sldOptions.length === 0 ? (
              <Link href="/admin/settings/page-templates" className="text-xs text-primary hover:underline">
                Add templates →
              </Link>
            ) : (
              <TemplateSelect
                name="sld_wrapper_id"
                value={sldId}
                onChange={setSldId}
                options={sldOptions}
              />
            )}
          </SlotRow>

        </div>
      </SectionCard>

      {/* ── Optional add-ons ─────────────────────────────────────────────── */}
      <SectionCard title="Optional Add-On Documents">
        <div className="divide-y divide-surface">

          <AddonToggleRow
            label="Application Form"
            included={includeApp}
            incomplete={includeApp && !appId}
            onToggle={(v) => {
              if (authorityRequiresApp) return;
              setIncludeApp(v);
              if (!v) { setAppId(""); clearValError("app"); }
            }}
            error={valErrors.app}
            authorityRequired={authorityRequiresApp}
            authorityWarning={
              authorityRequiresApp && !appId
                ? "Required by authority — select a template before activating."
                : undefined
            }
          >
            {applicationOptions.length === 0 ? (
              <Link href="/admin/settings/page-templates" className="text-xs text-primary hover:underline">
                Add template →
              </Link>
            ) : (
              <TemplateSelect
                name="app_page_template_id"
                value={appId}
                onChange={setAppId}
                options={applicationOptions}
              />
            )}
          </AddonToggleRow>
          {!includeApp && <input type="hidden" name="app_page_template_id" value="" />}

          <AddonToggleRow
            label="Certification Form"
            // Certification Form is "required by authority" but its blueprint
            // template is optional — projects may upload/provide it directly.
            // We deliberately do NOT mark the row "incomplete" when empty.
            included={includeCert}
            incomplete={includeCert && !certId && !authorityRequiresCert}
            onToggle={(v) => {
              if (authorityRequiresCert) return;
              setIncludeCert(v);
              if (!v) { setCertId(""); clearValError("cert"); }
            }}
            error={valErrors.cert}
            authorityRequired={authorityRequiresCert}
            authorityWarning={
              authorityRequiresCert && !certId
                ? "Template optional — upload/provide certification form at project level if needed."
                : undefined
            }
          >
            {certificationOptions.length === 0 ? (
              <Link href="/admin/settings/page-templates" className="text-xs text-primary hover:underline">
                Add template →
              </Link>
            ) : (
              <TemplateSelect
                name="cert_page_template_id"
                value={certId}
                onChange={setCertId}
                options={certificationOptions}
              />
            )}
          </AddonToggleRow>
          {!includeCert && <input type="hidden" name="cert_page_template_id" value="" />}

          <AddonToggleRow
            label="COI"
            // COI is "required by authority" but its blueprint template is
            // optional — projects may upload/provide it directly. We
            // deliberately do NOT mark the row "incomplete" when empty.
            included={includeCoi}
            incomplete={includeCoi && !coiId && !authorityRequiresCoi}
            onToggle={(v) => {
              if (authorityRequiresCoi) return;
              setIncludeCoi(v);
              if (!v) { setCoiId(""); clearValError("coi"); }
            }}
            error={valErrors.coi}
            authorityRequired={authorityRequiresCoi}
            authorityWarning={
              authorityRequiresCoi && !coiId
                ? "Template optional — upload/provide COI at project level if needed."
                : undefined
            }
          >
            {coiOptions.length === 0 ? (
              <Link href="/admin/settings/page-templates" className="text-xs text-primary hover:underline">
                Add COI template →
              </Link>
            ) : (
              <select
                name="coi_template_id"
                value={coiId}
                onChange={(e) => setCoiId(e.target.value)}
                className="rounded-lg border border-rule bg-canvas px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select</option>
                {coiOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </AddonToggleRow>
          {!includeCoi && <input type="hidden" name="coi_template_id" value="" />}

        </div>
      </SectionCard>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !isDirty}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            isDirty && !pending
              ? "text-white"
              : "text-faint bg-surface border border-rule cursor-default"
          }`}
          style={isDirty && !pending
            ? { background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }
            : undefined}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
