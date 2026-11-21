"use client";

import { BookmarkPlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildBookmarklet } from "@/lib/bookmarklet";

export function BookmarkletInstall() {
  const link = useRef<HTMLAnchorElement>(null);
  const [clicked, setClicked] = useState(false);

  // React blocks javascript: URLs in markup, so set it directly, using this
  // site's own address (local copy → local, live site → live).
  useEffect(() => {
    link.current?.setAttribute(
      "href",
      buildBookmarklet(window.location.origin),
    );
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add jobs from LinkedIn, Indeed and others</CardTitle>
        <CardDescription>
          Some sites block Fitcheck from opening their links. This button reads
          the job in your own browser, where you're already signed in, and sends
          the text here. It never sees your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* biome-ignore lint/a11y/useValidAnchor: a bookmarklet is a real link the user drags; its href is set in the effect above */}
          <a
            ref={link}
            href="#send-to-fitcheck"
            draggable
            onClick={(e) => {
              e.preventDefault();
              setClicked(true);
            }}
            className="inline-flex h-9 cursor-grab items-center gap-2 rounded-lg border-2 border-dashed border-foreground/30 bg-highlight px-3 text-sm font-semibold text-foreground active:cursor-grabbing"
          >
            <BookmarkPlusIcon className="size-4" aria-hidden />
            Send to Fitcheck
          </a>
          <span className="text-sm text-muted-foreground">
            Drag this to your bookmarks bar.
          </span>
        </div>
        {clicked ? (
          <p role="alert" className="text-sm text-partial">
            Drag the button to your bookmarks bar instead of clicking it. Then
            click it there when you're on a job page.
          </p>
        ) : null}
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            Show your bookmarks bar: <kbd className="font-sans">⌘ Shift B</kbd>{" "}
            on Mac, <kbd className="font-sans">Ctrl Shift B</kbd> on Windows.
          </li>
          <li>Drag the yellow button onto it.</li>
          <li>
            Open a job on any site and click <strong>Send to Fitcheck</strong>.
            To send only part of a page, select that text first.
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
