import { z } from "zod";

// "Send to Fitcheck": a bookmarklet that reads the job page in the user's
// own (possibly logged-in) browser and opens Fitcheck with the text filled
// in. The job travels in the URL #fragment, which browsers never send to a
// server, and which works even on sites that isolate their windows (COOP).

/** Characters of job text the bookmarklet sends (keeps the URL a sane size). */
export const MAX_IMPORT_CHARS = 20_000;

/** Where specific sites put the job description. Checked first, in order. */
const SITE_SELECTORS = [
  "#jobDescriptionText", // Indeed
  ".jobs-description__content", // LinkedIn
  ".jobs-box__html-content", // LinkedIn
  "#job-details", // LinkedIn
  '[class*="JobDetails_jobDescription"]', // Glassdoor
  '[data-ui="job-description"]', // Workable
];

/**
 * Likely containers on any other site. The one with the most text wins:
 * the job description is almost always the biggest block on the page,
 * while the first <article> is often a "related jobs" sidebar.
 */
const GENERIC_SELECTOR =
  '[class*="description" i],[id*="description" i],[class*="job-detail" i],article,main,[role="main"]';

/** The bookmarklet's source, before it's turned into a javascript: URL. */
function source(origin: string) {
  return `(()=>{
var sel=String(getSelection()).trim();
var len=function(el){return el?el.innerText.trim().length:0};
var pick=function(){
var s=${JSON.stringify(SITE_SELECTORS)};
for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(len(el)>200)return el.innerText}
var best=null;document.querySelectorAll(${JSON.stringify(GENERIC_SELECTOR)}).forEach(function(el){if(len(el)>len(best))best=el});
return len(best)>300?best.innerText:document.body.innerText};
var text=(sel.length>200?sel:pick()).replace(/\\n{3,}/g,"\\n\\n").trim();
var payload={v:1,url:location.href,title:document.title.slice(0,300),text:(document.title+"\\n\\n"+text).slice(0,${MAX_IMPORT_CHARS})};
var w=window.open(${JSON.stringify(`${origin}/jobs/import`)}+"#"+encodeURIComponent(JSON.stringify(payload)),"_blank");
if(!w)alert("Allow pop-ups for this site to send jobs to Fitcheck.");
})()`;
}

/** A javascript: URL to save as a bookmark. */
export function buildBookmarklet(origin: string): string {
  const compact = source(origin)
    .split("\n")
    .map((line) => line.trim())
    .join("");
  return `javascript:${encodeURIComponent(compact)}`;
}

const ImportPayload = z.object({
  v: z.literal(1),
  url: z
    .string()
    .max(2_000)
    .refine((u) => /^https?:\/\//i.test(u), "not a web link"),
  title: z.string().max(300),
  text: z.string().min(50).max(MAX_IMPORT_CHARS),
});

export type ImportedJob = z.infer<typeof ImportPayload>;

/**
 * Reads a job sent by the bookmarklet from a URL #fragment. Anything that
 * doesn't look exactly right is ignored, since any page could link here.
 */
export function parseImportHash(hash: string): ImportedJob | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const parsed = ImportPayload.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
