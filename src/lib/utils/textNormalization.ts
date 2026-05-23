/**
 * Normalize a value to an uppercase, trimmed string for permit-facing intake
 * fields. GRANTED renders these fields onto cover sheets and authority
 * templates which expect all-caps formatting.
 *
 * Behavior:
 *   - non-string / null / undefined → null
 *   - whitespace-only → null
 *   - otherwise → trimmed value, uppercased via toLocaleUpperCase("en-US")
 *
 * Idempotent: re-normalizing an already-normalized value returns the same value.
 *
 * Do NOT use for emails, URLs, storage paths, file names, IDs, passwords,
 * job numbers, notes, or system enum keys. See AGENTS.md / audit notes.
 */
export function normalizeUpperText(
  value: FormDataEntryValue | string | null | undefined
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.toLocaleUpperCase("en-US");
}

/**
 * Convenience wrapper: pull `key` from a FormData object and normalize it.
 */
export function normalizeUpperFormField(
  formData: FormData,
  key: string
): string | null {
  return normalizeUpperText(formData.get(key));
}
