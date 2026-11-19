import Link from "next/link";
import { Suspense } from "react";

import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/session";

const steps = [
  "Paste a job post",
  "We find proof in your CV and GitHub",
  "Get a fit score, your gaps and tailored CV bullets",
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Fitcheck</h1>
        <p className="text-lg text-muted-foreground">
          See how well you fit a job before you apply, with proof from your own
          work.
        </p>
      </div>

      <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
        {steps.map((step, i) => (
          <li key={step}>
            <span className="font-medium text-foreground">{i + 1}.</span> {step}
          </li>
        ))}
      </ol>

      <Suspense fallback={<SignInButton />}>
        <AuthAction />
      </Suspense>
    </main>
  );
}

async function AuthAction() {
  const session = await getSession();
  if (!session) return <SignInButton />;
  return (
    <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
      Go to your dashboard
    </Link>
  );
}
