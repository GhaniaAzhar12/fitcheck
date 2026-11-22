"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { buyCredits } from "./actions";

export function BuyButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // On success the action redirects to Stripe Checkout.
          const result = await buyCredits();
          if (result?.error) toast.error(result.error);
        })
      }
    >
      {pending ? "Opening Stripe Checkout…" : label}
    </Button>
  );
}
