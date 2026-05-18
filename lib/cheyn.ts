import crypto from "node:crypto";
import { captureServerEvent, type ServerEventProperties } from "@/lib/analytics-server";

export const CHEYN_PLUS_DURATION_DAYS = 30;
export const CHEYN_PLUS_DISPLAY_AMOUNT = process.env.CHEYN_PLUS_DISPLAY_AMOUNT || "5.00";
export const CHEYN_PLUS_DISPLAY_CURRENCY = process.env.CHEYN_PLUS_DISPLAY_CURRENCY || "USD";

export const cheynConfig = {
  apiBaseUrl: process.env.CHEYN_API_BASE_URL || "https://cheyn.ribaunt.com",
  apiKey: process.env.CHEYN_API_KEY || "",
  storeId: process.env.CHEYN_STORE_ID || "",
  webhookSecret: process.env.CHEYN_WEBHOOK_SECRET || "",
};

export type CheynCheckoutStatus =
  | "waiting_for_payment"
  | "pending"
  | "underpaid"
  | "paid"
  | "confirming"
  | "payout_pending"
  | "payout_sent"
  | "completed"
  | "expired"
  | "failed"
  | "cancelled";

export type CheynCheckoutResponse = {
  id: string;
  checkoutId: string;
  storeId: string;
  status: CheynCheckoutStatus;
  amountAtomic: string;
  currency: "XMR";
  checkoutUrl: string;
  expiresAt?: string;
  pricing?: Record<string, unknown>;
};

export function logCheynEvent(
  event: string,
  properties?: ServerEventProperties,
  distinctId?: string
) {
  captureServerEvent(`cheyn_${event}`, properties, distinctId);
}

export function assertCheynCheckoutConfig() {
  const missing = [
    ["CHEYN_API_KEY", cheynConfig.apiKey],
    ["CHEYN_STORE_ID", cheynConfig.storeId],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Missing Cheyn checkout config: ${missing.map(([name]) => name).join(", ")}`);
  }
}

export function assertCheynWebhookConfig() {
  if (!cheynConfig.webhookSecret) {
    throw new Error("Missing Cheyn webhook config: CHEYN_WEBHOOK_SECRET");
  }
}

export async function createCheynPlusCheckout({
  origin,
  orderId,
  userId,
}: {
  origin: string;
  orderId: string;
  userId: string;
}): Promise<CheynCheckoutResponse> {
  assertCheynCheckoutConfig();

  const payload = {
    storeId: cheynConfig.storeId,
    amount: CHEYN_PLUS_DISPLAY_AMOUNT,
    currency: CHEYN_PLUS_DISPLAY_CURRENCY,
    metadata: {
      orderId,
      userId,
      plan: "tekir_plus",
      durationDays: String(CHEYN_PLUS_DURATION_DAYS),
    },
    successUrl: `${origin}/plus/callback/monero`,
    cancelUrl: `${origin}/settings/account`,
  };

  const response = await fetch(`${cheynConfig.apiBaseUrl.replace(/\/$/, "")}/v1/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cheynConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : "Failed to create Cheyn checkout";
    throw new Error(message);
  }

  const checkoutId = data?.id || data?.checkoutId;
  const checkoutUrl = data?.checkoutUrl || data?.url;
  const amountAtomic = data?.amountAtomic;
  if (!checkoutId || !checkoutUrl || !amountAtomic) {
    logCheynEvent("checkout_invalid_response", {
      response_keys: data && typeof data === "object" ? Object.keys(data).join(",") : "",
      has_checkout_id: Boolean(checkoutId),
      has_checkout_url: Boolean(checkoutUrl),
      has_amount_atomic: Boolean(amountAtomic),
    });
    throw new Error("Cheyn returned an invalid checkout response");
  }

  return {
    ...data,
    id: checkoutId,
    checkoutId,
    storeId: data.storeId || cheynConfig.storeId,
    status: data.status || "pending",
    amountAtomic,
    currency: data.currency || "XMR",
    checkoutUrl,
    pricing: data.pricing ?? {
      displayAmount: CHEYN_PLUS_DISPLAY_AMOUNT,
      displayCurrency: CHEYN_PLUS_DISPLAY_CURRENCY,
      amountUsdCents: data.amountUsdCents,
      pricingCurrency: data.pricingCurrency,
      xmrUsdPriceDecimal: data.xmrUsdPriceDecimal,
      xmrUsdPriceMicro: data.xmrUsdPriceMicro,
    },
  } as CheynCheckoutResponse;
}

export function timingSafeEqualHex(a: string, b: string) {
  try {
    const aBuffer = Buffer.from(a, "hex");
    const bBuffer = Buffer.from(b, "hex");
    if (aBuffer.length !== bBuffer.length) return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
  } catch {
    return false;
  }
}

function isFreshTimestamp(timestamp: string, toleranceMs = 5 * 60 * 1000) {
  const ageMs = Math.abs(Date.now() - Number(timestamp));
  return Number.isFinite(ageMs) && ageMs <= toleranceMs;
}

export function verifyCheynWebhook(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...valueParts] = part.split("=");
      return [key, valueParts.join("=")];
    })
  );

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature || !isFreshTimestamp(timestamp)) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return timingSafeEqualHex(expected, signature);
}

export function canonicalizeCallbackQuery(params: URLSearchParams) {
  return Array.from(params.entries())
    .filter(([key]) => key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function verifyCheynCallback(url: string, secret: string) {
  if (!secret) return false;

  const parsed = new URL(url);
  const provided = parsed.searchParams.get("signature");
  const timestamp = parsed.searchParams.get("timestamp");
  if (!provided || !timestamp || !isFreshTimestamp(timestamp)) return false;

  const canonicalQuery = canonicalizeCallbackQuery(parsed.searchParams);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(canonicalQuery)
    .digest("hex");

  return timingSafeEqualHex(expected, provided);
}

export function isCheynActivationStatus(status: string) {
  return status === "payout_pending" || status === "payout_sent" || status === "completed";
}

export function calculatePlusExpiry(currentExpiry?: number | null) {
  const base = Math.max(Date.now(), currentExpiry ?? 0);
  return base + CHEYN_PLUS_DURATION_DAYS * 24 * 60 * 60 * 1000;
}
