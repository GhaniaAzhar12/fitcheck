import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import * as cheerio from "cheerio";

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;
/** Less than this after cleaning usually means a login wall or an app shell. */
const MIN_TEXT = 300;

/** A message that is safe to show the user as-is. */
export class JobPageError extends Error {}

/**
 * Downloads a job post page and returns its readable text.
 * Prefers the schema.org JobPosting data most job boards embed.
 */
export async function fetchJobPage(rawUrl: string): Promise<string> {
  const html = await download(rawUrl);
  const $ = cheerio.load(html);

  const fromJsonLd = jobPostingText($);
  if (fromJsonLd && fromJsonLd.length >= MIN_TEXT) return fromJsonLd;

  $(
    "script, style, noscript, svg, iframe, nav, header, footer, form, button, [aria-hidden='true']",
  ).remove();
  const root = $("main").first().length ? $("main").first() : $("body");
  const text = collapse(blockText($, root));

  if (text.length < MIN_TEXT) {
    throw new JobPageError(
      "We couldn't read a job post on that page (it may need a login, like LinkedIn). Paste the job text instead.",
    );
  }
  return text;
}

// ─── Download with SSRF protection ────────────────────────────────────────────

async function download(rawUrl: string): Promise<string> {
  let url = parseUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname);

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual", // follow by hand so every hop is checked
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; FitcheckBot/0.1; +https://github.com/GhaniaAzhar12/fitcheck)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      throw new JobPageError(
        "That page didn't respond in time. Check the link or paste the job text instead.",
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) break;
      url = parseUrl(new URL(next, url).toString());
      continue;
    }
    if (!res.ok) {
      throw new JobPageError(
        `That page returned an error (${res.status}). Check the link or paste the job text instead.`,
      );
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text/plain")) {
      throw new JobPageError(
        "That link isn't a web page (it may be a PDF). Paste the job text instead.",
      );
    }
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
      throw new JobPageError("That page is too large to read.");
    }
    const body = await res.text();
    if (body.length > MAX_BYTES) {
      throw new JobPageError("That page is too large to read.");
    }
    return body;
  }
  throw new JobPageError("That link redirects too many times.");
}

function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new JobPageError(
      "That doesn't look like a link. It should start with https://",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new JobPageError("Only http and https links are supported.");
  }
  if (url.username || url.password) {
    throw new JobPageError("Links with a username or password aren't allowed.");
  }
  return url;
}

async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new JobPageError("That link points to a private address.");
  }

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new JobPageError("We couldn't find that website. Check the link.");
    }
  }
  if (addresses.some(isPrivateAddress)) {
    throw new JobPageError("That link points to a private address.");
  }
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a.startsWith("::ffff:")) return isPrivateAddress(a.slice(7));
    return (
      a === "::" ||
      a === "::1" ||
      a.startsWith("fc") ||
      a.startsWith("fd") || // unique local
      a.startsWith("fe8") ||
      a.startsWith("fe9") ||
      a.startsWith("fea") ||
      a.startsWith("feb") // link-local
    );
  }
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast and reserved
  );
}

// ─── Text extraction ──────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

/** Reads a schema.org JobPosting from <script type="application/ld+json">. */
function jobPostingText($: cheerio.CheerioAPI): string | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let data: unknown;
    try {
      data = JSON.parse($(el).text());
    } catch {
      continue;
    }
    const posting = findJobPosting(data);
    if (!posting) continue;

    const company = (posting.hiringOrganization as Json | undefined)?.name;
    const description = String(posting.description ?? "");
    const descriptionText = collapse(
      blockText(cheerio.load(description), cheerio.load(description).root()),
    );
    const lines = [
      posting.title && `Title: ${posting.title}`,
      company && `Company: ${company}`,
      posting.employmentType && `Employment type: ${posting.employmentType}`,
      posting.jobLocationType && `Location type: ${posting.jobLocationType}`,
      posting.applicantLocationRequirements &&
        `Applicant location: ${JSON.stringify(posting.applicantLocationRequirements)}`,
      posting.baseSalary && `Salary: ${JSON.stringify(posting.baseSalary)}`,
      "",
      descriptionText,
    ];
    return collapse(
      lines.filter((l) => l !== undefined && l !== false).join("\n"),
    );
  }
  return null;
}

function findJobPosting(data: unknown): Json | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Json;
  const type = obj["@type"];
  if (
    type === "JobPosting" ||
    (Array.isArray(type) && type.includes("JobPosting"))
  ) {
    return obj;
  }
  return findJobPosting(obj["@graph"]);
}

/** Text with line breaks kept at block elements and list items. */
function blockText(
  $: cheerio.CheerioAPI,
  root: ReturnType<cheerio.CheerioAPI>,
): string {
  root.find("br").replaceWith("\n");
  root
    .find("p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article, ul, ol")
    .each((_, el) => {
      const node = $(el);
      if (el.tagName === "li") node.prepend("- ");
      node.append("\n");
    });
  return root.text();
}

function collapse(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
