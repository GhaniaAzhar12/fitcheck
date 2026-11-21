"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { parseImportHash } from "@/lib/bookmarklet";
import { saveImport } from "@/lib/import-storage";

export function ImportReceiver() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  // React runs effects twice in development; the first run clears the
  // #fragment, so a second run must not treat the empty hash as a failure.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const job = parseImportHash(window.location.hash);
    // Clear the job text from the address bar and history either way.
    window.history.replaceState(null, "", window.location.pathname);
    if (job && saveImport(job)) {
      router.replace("/jobs/new?import=1");
    } else {
      setFailed(true);
    }
  }, [router]);

  if (!failed) {
    return (
      <p aria-live="polite" className="text-muted-foreground">
        Opening the job in Fitcheck…
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-muted-foreground">
        There's no job to add here. Open a job post, click{" "}
        <strong className="text-foreground">Send to Fitcheck</strong> in your
        bookmarks bar, and it will open here with the text filled in.
      </p>
      <Link href="/jobs/new" className={buttonVariants({ variant: "outline" })}>
        Add a job by hand
      </Link>
    </div>
  );
}
