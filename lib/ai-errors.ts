import { APICallError, NoObjectGeneratedError } from "ai";

/**
 * A plain-English message for an AI model failure, or null if the error
 * isn't one. Shared by job extraction and fit analysis.
 */
export function aiErrorMessage(error: unknown): string | null {
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "The AI model took too long to answer. Try again in a moment.";
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) {
      return "The free AI quota is used up for now. Try again in a minute.";
    }
    if (error.statusCode && error.statusCode >= 500) {
      return "The AI model is busy right now. Try again in a moment.";
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "The AI key was rejected. If you use your own key, check it in Set up → AI model.";
    }
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return "The AI gave an answer we couldn't read. Try again.";
  }
  return null;
}

/** A short, safe summary for server logs (full errors can echo request details). */
export function errorSummary(error: unknown) {
  return {
    name: error instanceof Error ? error.name : typeof error,
    status: APICallError.isInstance(error) ? error.statusCode : undefined,
    message: error instanceof Error ? error.message.slice(0, 300) : undefined,
  };
}
