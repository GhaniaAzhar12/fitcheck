// Browser-side AI settings. The API key lives only in this browser's
// localStorage; it is sent with a request when needed and never stored
// on the server.

export type AiMode = "free" | "own" | "local";
export type OwnProvider = "google" | "anthropic";

export type AiSettings = {
  mode: AiMode;
  provider: OwnProvider;
  apiKey: string;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  mode: "free",
  provider: "google",
  apiKey: "",
};

const STORAGE_KEY = "fitcheck.ai";

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const data = JSON.parse(raw) as Partial<AiSettings>;
    return {
      mode: data.mode === "own" || data.mode === "local" ? data.mode : "free",
      provider: data.provider === "anthropic" ? "anthropic" : "google",
      apiKey: typeof data.apiKey === "string" ? data.apiKey : "",
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** Hidden form fields that tell the server which model to use. */
export function aiFormFields(settings: AiSettings): Record<string, string> {
  if (settings.mode === "own" && settings.apiKey) {
    return { aiProvider: settings.provider, aiKey: settings.apiKey };
  }
  if (settings.mode === "local") return { aiProvider: "ollama" };
  return {};
}
