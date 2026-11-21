import Link from "next/link";
import { Suspense } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { getSession } from "@/lib/session";

/** The wordmark: a check inside a highlighter square, like a marked line. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid size-6 place-items-center rounded-[5px] bg-highlight text-[13px] text-foreground"
      >
        ✓
      </span>
      Fitcheck
    </span>
  );
}

const NAV: { href: string; label: string; wideOnly?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs/new", label: "New job" },
  // Reachable from the dashboard too, so hidden on narrow phones.
  { href: "/usage", label: "Usage", wideOnly: true },
  { href: "/onboarding?step=1", label: "Set up", wideOnly: true },
];

async function SignedInNav() {
  const session = await getSession();
  if (!session) return null;
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground ${item.wideOnly ? "hidden sm:inline" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="Fitcheck home" className="rounded-md">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          {/* Reads the session, so it streams in after the static shell. */}
          <Suspense fallback={null}>
            <SignedInNav />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
