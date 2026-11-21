// Makes two links to the same job post compare equal, so re-adding a job
// opens the saved one instead of creating a duplicate.

const TRACKING =
  /^(utm_\w+|ref|refs|source|src|gh_src|lever-source|trk|trkInfo|fbclid|gclid|mc_cid|mc_eid)$/i;

export function normalizeJobUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const query = url.searchParams.toString();
  return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ""}`;
}
