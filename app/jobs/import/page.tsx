import type { Metadata } from "next";

import { ImportReceiver } from "./import-receiver";

export const metadata: Metadata = { title: "Add job · Fitcheck" };

// Opened by the "Send to Fitcheck" bookmarklet with the job in the #fragment.
export default function ImportPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Add job</h1>
      <ImportReceiver />
    </main>
  );
}
