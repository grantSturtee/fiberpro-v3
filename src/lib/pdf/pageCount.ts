/**
 * Page-count utilities — Phase H3.
 *
 * Small, dependency-free wrapper around pdf-lib's `getPageCount` that is safe
 * to call on untrusted bytes. Returns `null` on parse failure so callers can
 * implement their own fallback policy.
 *
 * Reused for:
 *   - TCP sheet counting in the pricing resolver (financial correctness)
 *   - Any future operational tooling that needs a quick "how many pages?"
 *
 * Note: pdf-lib's `getPageCount` reads the document's page tree count without
 * rendering content. It is cheap relative to the download cost — the bottleneck
 * for callers is fetching bytes from storage, not parsing them.
 */

import { PDFDocument } from "pdf-lib";

/**
 * Return the page count of a PDF, or `null` if the bytes cannot be parsed.
 * Never throws. Logs a warning for visibility but suppresses the original
 * error from the caller's perspective.
 */
export async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, {
      // Be lenient with malformed PDFs — better to read a slightly-broken
      // document than fall back to a file-count-equals-1 estimate.
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
    return doc.getPageCount();
  } catch (err) {
    console.warn("countPdfPages: failed to parse PDF bytes:", err);
    return null;
  }
}
