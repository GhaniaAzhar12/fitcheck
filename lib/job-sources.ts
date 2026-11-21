// Job sites whose pages can't be read without a browser or a login.
// Caught before fetching so the user gets steps that work, not a vague error.

const GOOGLE_JOBS =
  "That's a Google Jobs link, which only opens in a browser. On Google, click “Apply on …” and paste that page's link, or copy the job description into Job text.";

const LINKEDIN =
  "LinkedIn job pages need a login. Open the job, copy the description (“About the job”) and paste it into Job text.";

/** A message explaining how to add this job, or null if we can try the link. */
export function unreadableSourceMessage(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "share.google" || host === "g.co") return GOOGLE_JOBS;
  if (/^google\.[a-z.]+$/.test(host) && /^\/(search|jobs)/.test(url.pathname)) {
    return GOOGLE_JOBS;
  }
  if (host === "lnkd.in" || /(^|\.)linkedin\.com$/.test(host)) return LINKEDIN;
  return null;
}
