"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateFieldMappings, type PageTemplateActionState } from "../actions";
import { FieldMappingEditor } from "./FieldMappingEditor";
import type { TemplateAsset } from "@/lib/actions/templateAssets";
import type { TemplateFont } from "@/lib/actions/templateFonts";

const initial: PageTemplateActionState = { error: null };

type Props = {
  id: string;
  fieldMappings: Record<string, unknown> | null;
  pdfSignedUrl: string | null;
  initialAssets: TemplateAsset[];
  fonts: TemplateFont[];
};

// Normalize field mappings to the same compact key-order that FieldMappingEditor's
// computedJson produces. Postgres JSONB alphabetizes keys on read, so a raw
// JSON.stringify of the DB value would produce a different string than computedJson
// even when the data is identical, causing a false-dirty state on initial load.
//
// Key order must match FieldMappingEditor.computedJson exactly:
//   top-level:  { mode, fontSize, fields, regions? }
//   field:      { key, x, y, page? }
//   region:     { id, type, label, x, y, width, height, page?, sourceKey?, assetId? }
function toComparableJson(m: Record<string, unknown> | null): string {
  if (!m) return "";

  if (m.mode === "overlay") {
    const rawFields = (m.fields as Array<Record<string, unknown>> | undefined) ?? [];
    const fields = rawFields
      .filter((f) => f.key && typeof f.x === "number" && typeof f.y === "number")
      .map((f) => {
        const field: Record<string, unknown> = { key: f.key, x: f.x, y: f.y };
        if (typeof f.page === "number") field.page = f.page;
        if (f.pageMode === "all" || f.pageMode === "specific") field.pageMode = f.pageMode;
        if (f.locked === true) field.locked = true;
        if (typeof f.fontId === "string" && f.fontId) field.fontId = f.fontId;
        if (typeof f.fontSize === "number") field.fontSize = f.fontSize;
        // Phase C — only emit when non-default, matching computedJson exactly
        // so existing saved mappings produce identical comparable strings.
        if (f.align === "center" || f.align === "right") field.align = f.align;
        if (f.anchor === "center") field.anchor = f.anchor;
        return field;
      });
    const fontSize      = typeof m.fontSize === "number" ? m.fontSize : 9;
    const defaultFontId = typeof m.defaultFontId === "string" && m.defaultFontId ? m.defaultFontId : undefined;

    const rawRegions = (m.regions as Array<Record<string, unknown>> | undefined) ?? [];
    const regions = rawRegions
      .filter(
        (r) =>
          r.id &&
          r.type &&
          typeof r.x === "number" &&
          typeof r.y === "number" &&
          typeof r.width === "number" &&
          typeof r.height === "number"
      )
      .map((r) => {
        const region: Record<string, unknown> = {
          id:     r.id,
          type:   r.type,
          label:  typeof r.label === "string" ? r.label : "",
          x:      r.x,
          y:      r.y,
          width:  r.width,
          height: r.height,
        };
        if (typeof r.page     === "number") region.page      = r.page;
        if (r.pageMode === "all" || r.pageMode === "specific") region.pageMode = r.pageMode;
        if (typeof r.sourceKey === "string") region.sourceKey = r.sourceKey;
        if (typeof r.assetId  === "string") region.assetId   = r.assetId;
        if (r.locked === true) region.locked = true;
        return region;
      });

    if (fields.length === 0 && regions.length === 0) return "";
    const obj: Record<string, unknown> = { mode: "overlay", fontSize, fields };
    if (defaultFontId) obj.defaultFontId = defaultFontId;
    if (regions.length > 0) obj.regions = regions;
    return JSON.stringify(obj);
  }

  return JSON.stringify(m);
}

export function FieldMappingsForm({ id, fieldMappings, pdfSignedUrl, initialAssets, fonts }: Props) {
  const [state, action, pending] = useActionState(updateFieldMappings, initial);

  const [savedJson, setSavedJson] = useState<string>(
    () => toComparableJson(fieldMappings)
  );

  const [currentJson, setCurrentJson] = useState<string>(savedJson);

  const prevStateRef = useRef(state);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (state === prevStateRef.current) return;
    prevStateRef.current = state;
    if (state.success) {
      setSavedJson(currentJson);
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 3000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isDirty = currentJson !== savedJson;

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <FieldMappingEditor
        pdfSignedUrl={pdfSignedUrl}
        initialMappings={fieldMappings}
        onJsonChange={setCurrentJson}
        isDirty={isDirty}
        pending={pending}
        saveError={state.error}
        saveSuccess={showSaved}
        templateId={id}
        initialAssets={initialAssets}
        fonts={fonts}
      />
    </form>
  );
}
