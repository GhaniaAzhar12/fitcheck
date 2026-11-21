"use server";

import { APICallError, generateText } from "ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { aiChoiceFrom } from "@/lib/ai-choice";
import { CvError, readCvPdf } from "@/lib/cv-pdf";
import { db } from "@/lib/db";
import { GitHubError, listPublicRepos } from "@/lib/github";
import { getModel } from "@/lib/model";
import { MAX_REPOS, MIN_REPOS, minReposFor } from "@/lib/onboarding";
import { getSession } from "@/lib/session";

export type UploadCvState = { error?: string; saved?: boolean };

export async function uploadCv(
  _prev: UploadCvState,
  formData: FormData,
): Promise<UploadCvState> {
  const session = await getSession();
  if (!session) return { error: "Your session ended. Sign in again." };

  const file = formData.get("cv");
  if (!(file instanceof File)) return { error: "Choose a PDF file first." };

  try {
    const cv = await readCvPdf(file);
    await db.profile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        cvText: cv.text,
        cvFileName: cv.fileName,
        cvPages: cv.pages,
      },
      update: { cvText: cv.text, cvFileName: cv.fileName, cvPages: cv.pages },
    });
  } catch (error) {
    if (error instanceof CvError) return { error: error.message };
    console.error("[uploadCv]", error);
    return { error: "Something went wrong saving your CV. Try again." };
  }

  revalidatePath("/onboarding");
  return { saved: true };
}

export type CheckKeyState = { ok?: boolean; error?: string };

/** Sends one tiny prompt with the visitor's own key to check it works. */
export async function checkApiKey(
  _prev: CheckKeyState,
  formData: FormData,
): Promise<CheckKeyState> {
  const session = await getSession();
  if (!session) return { error: "Your session ended. Sign in again." };

  const choice = aiChoiceFrom(formData);
  if (!choice?.apiKey) return { error: "Paste a valid API key first." };

  try {
    const { model } = getModel(choice);
    await generateText({
      model,
      prompt: "Reply with the word OK.",
      maxOutputTokens: 5,
      abortSignal: AbortSignal.timeout(30_000),
    });
    return { ok: true };
  } catch (error) {
    if (APICallError.isInstance(error)) {
      if (
        error.statusCode === 400 ||
        error.statusCode === 401 ||
        error.statusCode === 403
      ) {
        return { error: "That key was rejected. Check you copied all of it." };
      }
      if (error.statusCode === 429) {
        return { error: "That key has no quota left right now." };
      }
    }
    return {
      error: "Couldn't check the key right now. Try again in a moment.",
    };
  }
}

export type SaveReposState = { error?: string; selected?: string[] };

export async function saveRepos(
  _prev: SaveReposState,
  formData: FormData,
): Promise<SaveReposState> {
  const selected = [...new Set(formData.getAll("repos").map(String))];

  const session = await getSession();
  if (!session)
    return { selected, error: "Your session ended. Sign in again." };

  try {
    // Never trust the form: only the user's own public repos are allowed.
    const available = await listPublicRepos(session.user.id);
    const allowed = new Set(available.map((r) => r.fullName));
    if (selected.some((name) => !allowed.has(name))) {
      return { selected, error: "Pick repos from your own list." };
    }

    const min = minReposFor(available.length);
    if (selected.length < min || selected.length > MAX_REPOS) {
      return {
        selected,
        error:
          min === MIN_REPOS
            ? `Pick between ${MIN_REPOS} and ${MAX_REPOS} repos.`
            : `Pick at least ${min} repo${min === 1 ? "" : "s"}.`,
      };
    }

    const updated = await db.profile.updateMany({
      where: { userId: session.user.id },
      data: { repos: selected },
    });
    if (updated.count === 0) {
      return { selected, error: "Upload your CV first (step 1)." };
    }
  } catch (error) {
    if (error instanceof GitHubError) return { selected, error: error.message };
    console.error("[saveRepos]", error);
    return {
      selected,
      error: "Something went wrong saving your repos. Try again.",
    };
  }

  redirect("/onboarding?step=3");
}
