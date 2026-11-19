import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** For protected pages: returns the session or sends the visitor home. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}
