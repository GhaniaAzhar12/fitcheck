"use server";

import { revalidatePath } from "next/cache";

import { CvError, readCvPdf } from "@/lib/cv-pdf";
import { db } from "@/lib/db";
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
