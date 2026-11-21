import Link from "next/link";
import { Suspense } from "react";

import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/session";

// ─── Sample report (fictional job), shown in the hero ────────────────────────

type Status = "met" | "partial" | "gap";

const SAMPLE: {
  status: Status;
  requirement: string;
  proof: React.ReactNode;
  source: string | null;
  code?: boolean;
}[] = [
  {
    status: "met",
    requirement: "3+ years with React",
    proof: (
      <>
        <mark>Led a 6-person team</mark> building a Next.js logistics platform
      </>
    ),
    source: "CV, Experience",
  },
  {
    status: "met",
    requirement: "Payments integration",
    proof: (
      <>
        <mark>Stripe checkout</mark> with webhook handling
      </>
    ),
    source: "shop/app/api/checkout/route.ts:18",
    code: true,
  },
  {
    status: "partial",
    requirement: "AWS or GCP",
    proof: "Deploys on Vercel; no AWS in the code yet",
    source: "shop/vercel.json",
    code: true,
  },
  {
    status: "gap",
    requirement: "Python services",
    proof: "Nothing in your CV or repos",
    source: null,
  },
];

const ICON: Record<
  Status,
  { glyph: string; label: string; className: string }
> = {
  met: { glyph: "✓", label: "Proven", className: "bg-met/12 text-met" },
  partial: {
    glyph: "~",
    label: "Partly proven",
    className: "bg-partial/12 text-partial",
  },
  gap: { glyph: "✗", label: "Gap", className: "bg-gap/12 text-gap" },
};

function EvidenceLedger() {
  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_0_0_var(--border),0_24px_48px_-32px_color-mix(in_oklab,var(--foreground)_35%,transparent)]">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <p className="font-semibold">Senior React Developer</p>
            <p className="text-sm text-muted-foreground">
              Remote, open to APAC
            </p>
          </div>
          <p className="text-right">
            <span className="block text-3xl font-semibold tabular-nums leading-none">
              68
            </span>
            <span className="text-xs text-muted-foreground">out of 100</span>
          </p>
        </div>

        <ul className="divide-y">
          {SAMPLE.map((row) => (
            <li key={row.requirement} className="flex gap-3 px-5 py-3.5">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-semibold ${ICON[row.status].className}`}
              >
                <span aria-hidden>{ICON[row.status].glyph}</span>
                <span className="sr-only">{ICON[row.status].label}:</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{row.requirement}</p>
                <p className="text-sm text-muted-foreground">{row.proof}</p>
                {row.source ? (
                  <p
                    className={`mt-1 truncate text-xs text-muted-foreground ${row.code ? "font-mono" : ""}`}
                  >
                    {row.source}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/50 px-5 py-3.5">
          <span className="rounded-md border border-partial/30 bg-partial/10 px-2.5 py-1 text-sm font-semibold text-partial">
            Apply with a plan
          </span>
          <span className="text-xs text-muted-foreground">
            One fixable gap: say how you'd pick up Python
          </span>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        A sample report for a made-up job.
      </figcaption>
    </figure>
  );
}

/** The main call to action is larger than app buttons. */
const HERO_CTA = "h-11 px-5 text-base";

// ─── Page ────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    title: "Paste a job post",
    body: "A link or the text. Fitcheck pulls out the must-haves and the nice-to-haves, and skips the fluff.",
  },
  {
    title: "It looks for proof",
    body: "An AI agent searches your CV and reads the GitHub repos you choose, and cites the line it found.",
  },
  {
    title: "Decide, then tailor",
    body: "You get a score, a plain verdict, CV bullets and interview answers, all built from what's real.",
  },
];

const PROMISES = [
  {
    title: "It won't invent numbers",
    body: "Every figure in your tailored CV bullets is checked against your CV. Anything it can't find is flagged before you use it.",
  },
  {
    title: "Only the repos you pick",
    body: "Fitcheck reads the public repos you choose as evidence, and nothing else on your account.",
  },
  {
    title: "Your key stays with you",
    body: "Use the free model, or your own Gemini or Claude key. Your key is kept in your browser, not on our server.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-12 px-4 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pb-24">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-5xl">
            Find out if you fit the job before you apply.
          </h1>
          <p className="max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
            Paste a job post. Fitcheck reads your CV and your GitHub code, shows
            the proof for each requirement, and tells you plainly whether to
            apply.
          </p>
          <div className="flex flex-col items-start gap-2">
            <Suspense fallback={<SignInButton className={HERO_CTA} />}>
              <AuthAction />
            </Suspense>
            <p className="text-sm text-muted-foreground">
              Free to use. Sign in with GitHub so it can read your repos.
            </p>
          </div>
        </div>
        <EvidenceLedger />
      </section>

      <section aria-labelledby="how-heading" className="border-t bg-card/60">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <h2
            id="how-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            How it works
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2">
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-full border text-sm font-semibold tabular-nums"
                >
                  {i + 1}
                </span>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="honest-heading" className="border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <h2
            id="honest-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            Honest by design
          </h2>
          <p className="mt-2 max-w-[60ch] text-muted-foreground">
            A fit check is only useful if you can trust it, so Fitcheck shows
            its sources and never pads your experience.
          </p>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {PROMISES.map((p) => (
              <div key={p.title} className="flex flex-col gap-2 border-t pt-4">
                <h3 className="font-semibold">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground">
          <p>
            Fitcheck: an AI job-fit copilot built with Next.js and the AI SDK.
          </p>
          <a
            href="https://github.com/GhaniaAzhar12/fitcheck"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}

async function AuthAction() {
  const session = await getSession();
  if (!session) return <SignInButton className={HERO_CTA} />;
  return (
    <Link
      href="/dashboard"
      className={buttonVariants({ size: "lg", className: HERO_CTA })}
    >
      Go to your dashboard
    </Link>
  );
}
