"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const NEXT = { light: "dark", dark: "system", system: "light" } as const;
const LABEL = { light: "Light", dark: "Dark", system: "Match system" } as const;

/** Cycles light → dark → system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (mounted ? theme : "system") as keyof typeof NEXT;
  const next = NEXT[current] ?? "light";
  const Icon =
    current === "light" ? SunIcon : current === "dark" ? MoonIcon : MonitorIcon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${LABEL[current]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={`Theme: ${LABEL[current]}`}
    >
      <Icon />
    </Button>
  );
}
