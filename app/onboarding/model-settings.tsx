"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type AiMode,
  type AiSettings,
  aiFormFields,
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  type OwnProvider,
  saveAiSettings,
} from "@/lib/ai-settings";

import { type CheckKeyState, checkApiKey } from "./actions";

const KEY_HELP: Record<OwnProvider, { label: string; url: string }> = {
  google: {
    label: "Google AI Studio",
    url: "https://aistudio.google.com/apikey",
  },
  anthropic: {
    label: "Anthropic Console",
    url: "https://console.anthropic.com/settings/keys",
  },
};

export function ModelSettings({ localAvailable }: { localAvailable: boolean }) {
  const router = useRouter();
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [check, checkAction, checking] = useActionState<
    CheckKeyState,
    FormData
  >(checkApiKey, {});

  // localStorage only exists in the browser, so read it after mounting.
  useEffect(() => {
    setSettings(loadAiSettings());
    setLoaded(true);
  }, []);

  function update(patch: Partial<AiSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function runCheck() {
    const formData = new FormData();
    for (const [k, v] of Object.entries(aiFormFields(settings)))
      formData.set(k, v);
    startTransition(() => checkAction(formData));
  }

  function finish() {
    if (settings.mode === "own" && settings.apiKey.trim().length < 20) {
      setSaveError("Paste your API key, or choose the free model.");
      return;
    }
    const ok = saveAiSettings({ ...settings, apiKey: settings.apiKey.trim() });
    if (!ok) {
      setSaveError(
        "Your browser blocked saving settings. The free model will be used.",
      );
      return;
    }
    router.push("/dashboard");
  }

  const options: { mode: AiMode; title: string; detail: string }[] = [
    {
      mode: "free",
      title: "Free (recommended to start)",
      detail: "Fitcheck's Gemini model. Can be slow at busy times.",
    },
    {
      mode: "own",
      title: "My own API key",
      detail: "Faster and private to you. Your key stays in this browser.",
    },
    ...(localAvailable
      ? [
          {
            mode: "local" as const,
            title: "Local model (Ollama)",
            detail: "Only on this computer. Needs `ollama serve` running.",
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={!loaded}>
        <legend className="sr-only">AI model</legend>
        {options.map((option) => (
          <label
            key={option.mode}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
              settings.mode === option.mode
                ? "border-foreground/40 bg-muted/60"
                : "hover:bg-muted/40"
            }`}
          >
            <input
              type="radio"
              name="mode"
              value={option.mode}
              checked={settings.mode === option.mode}
              onChange={() => update({ mode: option.mode })}
              className="mt-1"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{option.title}</span>
              <span className="text-sm text-muted-foreground">
                {option.detail}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {settings.mode === "own" ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="provider" className="text-sm font-medium">
              Provider
            </label>
            <select
              id="provider"
              value={settings.provider}
              onChange={(e) =>
                update({ provider: e.target.value as OwnProvider })
              }
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="google">Google Gemini (has a free tier)</option>
              <option value="anthropic">Anthropic Claude (paid)</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="apiKey" className="text-sm font-medium">
              API key
            </label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder="Paste your key"
            />
            <p className="text-xs text-muted-foreground">
              Get one from{" "}
              <a
                href={KEY_HELP[settings.provider].url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4"
              >
                {KEY_HELP[settings.provider].label}
              </a>
              . Stored only in this browser and sent only when Fitcheck calls
              the model.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={runCheck}
              disabled={checking || settings.apiKey.trim().length < 20}
            >
              {checking ? "Checking…" : "Check key"}
            </Button>
            {check.ok && !checking ? (
              <output className="text-sm text-muted-foreground">
                Key works ✓
              </output>
            ) : null}
            {check.error && !checking ? (
              <p role="alert" className="text-sm text-destructive">
                {check.error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {saveError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {saveError}
        </p>
      ) : null}

      <div>
        <Button type="button" size="lg" onClick={finish} disabled={!loaded}>
          Finish setup
        </Button>
      </div>
    </div>
  );
}
