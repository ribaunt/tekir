import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex-client";
import {
  assertCheynWebhookConfig,
  calculatePlusExpiry,
  cheynConfig,
  isCheynActivationStatus,
  logCheynEvent,
  verifyCheynWebhook,
  verifyMoneroWebhook,
} from "@/lib/cheyn";
import { handleAPIError } from "@/lib/api-error-tracking";
import { withAPIObservability } from "@/lib/api-observability";

export const runtime = "nodejs";

async function POSTHandler(req: NextRequest) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
  };

  try {
    assertCheynWebhookConfig();

    const rawBody = await req.text();
    const cheynSignature = req.headers.get("Cheyn-Signature");
    const moneroSignature = req.headers.get("x-monero-signature");
    const signatureValid =
      verifyCheynWebhook(rawBody, cheynSignature, cheynConfig.webhookSecret) ||
      verifyMoneroWebhook(rawBody, moneroSignature, cheynConfig.webhookSecret);

    if (!signatureValid) {
      logCheynEvent("webhook_invalid_signature", {
        has_cheyn_signature: Boolean(cheynSignature),
        has_monero_signature: Boolean(moneroSignature),
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401, headers });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Malformed payload" }, { status: 400, headers });
    }

    const nestedCheckout = event?.checkout;
    const eventType = event?.type || event?.event;
    const checkoutId = nestedCheckout?.id || event?.checkoutId;
    const storeId = event?.storeId || nestedCheckout?.storeId || req.headers.get("Cheyn-Store-Id") || undefined;
    const checkout = nestedCheckout ?? {
      amountAtomic: event?.amountAtomic,
      currency: event?.currency,
      receivedAtomic: event?.receivedAtomic,
      status: eventType === "payment.verified" ? "payment.verified" : event?.status,
      storeId,
      txHash: event?.txHash,
    };
    const eventId =
      req.headers.get("Cheyn-Event-Id") ||
      event?.id ||
      (eventType && checkoutId ? `${eventType}:${checkoutId}:${event?.txHash || event?.receivedAtomic || "event"}` : undefined);

    if (
      !eventId ||
      !eventType ||
      !checkoutId ||
      !storeId ||
      !checkout.status ||
      !checkout?.amountAtomic ||
      !checkout?.currency
    ) {
      return NextResponse.json({ error: "Malformed payload" }, { status: 400, headers });
    }

    if (cheynConfig.storeId && storeId !== cheynConfig.storeId) {
      return NextResponse.json({ error: "Store mismatch" }, { status: 401, headers });
    }

    const cronSecret = process.env.CONVEX_CRON_SECRET;
    if (!cronSecret) {
      throw new Error("CONVEX_CRON_SECRET is not configured");
    }

    const convex = getConvexClient();
    const existingCheckout = await convex.query(api.cheyn.getCheckoutById, { checkoutId });
    if (!existingCheckout) {
      return NextResponse.json({ error: "Unknown checkout" }, { status: 409, headers });
    }

    if (
      checkout.amountAtomic !== existingCheckout.amountAtomic ||
      checkout.currency !== existingCheckout.currency
    ) {
      return NextResponse.json({ error: "Checkout amount mismatch" }, { status: 409, headers });
    }

    const eventRecord = await convex.mutation(api.cheyn.recordWebhookEvent, {
      eventId,
      checkoutId,
      storeId,
      type: eventType,
      cronSecret,
    });

    if (eventRecord.duplicate) {
      logCheynEvent("webhook_duplicate", {
        event_type: eventType,
        checkout_id_present: true,
      });
      return NextResponse.json({ received: true, duplicate: true }, { headers });
    }

    const plusAccessExpiresAt = isCheynActivationStatus(checkout.status)
      ? calculatePlusExpiry(existingCheckout.plusAccessExpiresAt)
      : undefined;

    const applied = await convex.mutation(api.cheyn.applyCheckoutWebhook, {
      checkoutId,
      storeId,
      status: checkout.status,
      amountAtomic: checkout.amountAtomic,
      receivedAtomic: checkout.receivedAtomic,
      currency: checkout.currency,
      txHash: checkout.txHash,
      pricing: checkout.pricing,
      plusAccessExpiresAt,
      cronSecret,
    });

    if (!applied.applied) {
      logCheynEvent("webhook_rejected_transition", {
        event_type: eventType,
        status: checkout.status,
        current_status: applied.currentStatus,
        reason: applied.reason,
      });
      return NextResponse.json({ error: "Invalid status transition" }, { status: 409, headers });
    }

    if (plusAccessExpiresAt && applied.userId) {
      await convex.mutation(api.users.grantCheynPlusAccess, {
        id: applied.userId as Id<"users">,
        plusAccessExpiresAt,
        cronSecret,
      });
    }

    logCheynEvent(
      "webhook_processed",
      {
        event_type: eventType,
        status: checkout.status,
        activated_plus: Boolean(plusAccessExpiresAt),
      },
      applied.userId
    );

    return NextResponse.json({ received: true, webhookId: eventId }, { headers });
  } catch (error) {
    handleAPIError(error, req, "/api/cheyn/webhook", "POST", 500);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500, headers }
    );
  }
}

export const POST = withAPIObservability(POSTHandler);
