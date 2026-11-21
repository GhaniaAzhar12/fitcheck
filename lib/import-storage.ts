import type { ImportedJob } from "@/lib/bookmarklet";

// Hands a job from /jobs/import to the New job form in the same tab.
// sessionStorage: stays in this tab only, gone when the tab closes.

const KEY = "fitcheck.import";

export function saveImport(job: ImportedJob): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(job));
    return true;
  } catch {
    return false;
  }
}

/** Reads and removes the pending import, so it's used once. */
export function takeImport(): ImportedJob | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as ImportedJob) : null;
  } catch {
    return null;
  }
}
