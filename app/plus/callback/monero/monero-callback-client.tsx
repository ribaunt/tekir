"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";

type CheckoutStatus = {
  status: string;
  plusAccessExpiresAt?: number;
};

function isSuccess(status?: string) {
  return status === "payout_pending" || status === "payout_sent" || status === "completed";
}

function isFailure(status?: string) {
  return status === "underpaid" || status === "expired" || status === "failed" || status === "cancelled";
}

export function MoneroCallbackClient({
  checkoutId,
  verified,
}: {
  checkoutId: string | null;
  verified: boolean;
}) {
  const { checkAuthStatus } = useAuth();
  const [checkout, setCheckout] = useState<CheckoutStatus | null>(null);
  const [error, setError] = useState<string | null>(verified ? null : "We could not verify this Cheyn callback.");

  useEffect(() => {
    if (!verified || !checkoutId) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const response = await fetch(`/api/cheyn/checkout-status?checkoutId=${encodeURIComponent(checkoutId)}`, {
          credentials: "include",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to load checkout status");
        }

        if (cancelled) return;
        setCheckout(data);

        if (isSuccess(data.status)) {
          await checkAuthStatus(true);
          return;
        }

        if (!isFailure(data.status)) {
          timeout = setTimeout(poll, 5000);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load checkout status");
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [checkAuthStatus, checkoutId, verified]);

  const status = checkout?.status;
  const successful = isSuccess(status);
  const failed = isFailure(status);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm ph-no-capture">
        <div className="mb-4 flex justify-center">
          {error || failed ? (
            <AlertCircle className="h-10 w-10 text-destructive" />
          ) : successful ? (
            <CheckCircle2 className="h-10 w-10 text-primary" />
          ) : (
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          )}
        </div>

        <h1 className="text-xl font-semibold">
          {error
            ? "Unable to verify payment"
            : successful
              ? "Tekir Plus is active"
              : failed
                ? "Payment needs attention"
                : "Waiting for Monero confirmation"}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {error ||
            (successful
              ? "Your Monero payment was confirmed by Cheyn and your Plus access has been refreshed."
              : failed
                ? `Cheyn reported this checkout as ${status}. Please return to account settings or contact support.`
                : "We verified the callback. Tekir is waiting for Cheyn's signed webhook before activating Plus.")}
        </p>

        <Link className={buttonVariants({ className: "mt-6 w-full" })} href="/settings/account">
          Back to account settings
        </Link>
      </div>
    </div>
  );
}
