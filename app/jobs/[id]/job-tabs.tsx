"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Report / Tailor tabs. Panels are server-rendered and passed in. */
export function JobTabs({
  report,
  tailor,
}: {
  report: ReactNode;
  tailor: ReactNode;
}) {
  return (
    <Tabs defaultValue="report">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="report">Report</TabsTrigger>
        <TabsTrigger value="tailor">Tailor</TabsTrigger>
      </TabsList>
      <TabsContent value="report" className="flex flex-col gap-4 pt-2">
        {report}
      </TabsContent>
      {/* Kept mounted so switching tabs doesn't throw away generated text. */}
      <TabsContent
        value="tailor"
        keepMounted
        className="flex flex-col gap-4 pt-2"
      >
        {tailor}
      </TabsContent>
    </Tabs>
  );
}
