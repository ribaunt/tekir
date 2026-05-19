import crypto from "node:crypto";
import { captureServerEvent, type ServerEventProperties } from "@/lib/analytics-server";

export const CHEYN_PLUS_DURATION_DAYS = 30;
export const CHEYN_PLUS_DISPLAY_AMOUNT = process.env.CHEYN_PLUS_DISPLAY_AMOUNT || "5.00";
export const CHEYN_PLUS_DISPLAY_CURRENCY = process.env.CHEYN_PLUS_DISPLAY_CURRENCY || "USD";

export const cheynConfig = {
  apiBaseUrl: process.env.CHEYN_API_BASE_URL || "https://cheyn.ribaunt.com",
  checkoutPath: process.env.CHEYN_CHECKOUT_PATH || "/api/v1/checkouts",
  callbackBaseUrl: process.env.CHEYN_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "",
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

export class CheynCheckoutError extends Error {
  status: number;
  path: string;
  responsePreview: string;

  constructor({
    message,
    path,
    responsePreview,
    status,
  }: {
    message: string;
    path: string;
    responsePreview: string;
    status: number;
  }) {
    super(message);
    this.name = "CheynCheckoutError";
    this.status = status;
    this.path = path;
    this.responsePreview = responsePreview;
  }
}

function redactMiddle(value: string, visible = 8) {
  if (!value) return "";
  if (value.length <= visible * 2) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

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
    ["CHEYN_CALLBACK_BASE_URL or NEXT_PUBLIC_APP_URL", cheynConfig.callbackBaseUrl],
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

  const callbackOrigin = cheynConfig.callbackBaseUrl.replace(/\/$/, "");
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
    successUrl: `${callbackOrigin}/callback/monero`,
    cancelUrl: `${callbackOrigin}/callback/monero/cancel`,
  };

  const checkoutPath = cheynConfig.checkoutPath.startsWith("/")
    ? cheynConfig.checkoutPath
    : `/${cheynConfig.checkoutPath}`;
  const upstreamUrl = `${cheynConfig.apiBaseUrl.replace(/\/$/, "")}${checkoutPath}`;
  const startedAt = Date.now();

  const logContext = {
    url_host: (() => {
      try {
        return new URL(upstreamUrl).host;
      } catch {
        return "invalid";
      }
    })(),
    path: checkoutPath,
    origin,
    callback_origin: callbackOrigin,
    order_id: orderId,
    user_id_present: Boolean(userId),
    user_id_preview: redactMiddle(userId),
    has_api_key: Boolean(cheynConfig.apiKey),
    api_key_prefix: cheynConfig.apiKey.slice(0, 8),
    store_id: cheynConfig.storeId,
    amount: CHEYN_PLUS_DISPLAY_AMOUNT,
    currency: CHEYN_PLUS_DISPLAY_CURRENCY,
    success_url: payload.successUrl,
    cancel_url: payload.cancelUrl,
    metadata_keys: Object.keys(payload.metadata).join(","),
    payload_keys: Object.keys(payload).join(","),
  };

  console.info("[Cheyn] Creating Plus checkout", logContext);
  logCheynEvent("checkout_request_started", logContext, userId);

  let response: Response;
  try {
    response = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cheynConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "Unknown network error";
    console.error("[Cheyn] Checkout fetch failed", {
      ...logContext,
      duration_ms: durationMs,
      error: message,
    });
    logCheynEvent("checkout_fetch_failed", {
      ...logContext,
      duration_ms: durationMs,
      error_message: message,
    }, userId);
    throw error;
  }

  const responseText = await response.text();
  const durationMs = Date.now() - startedAt;
  const data = responseText
    ? (() => {
        try {
          return JSON.parse(responseText);
        } catch {
          return null;
        }
      })()
    : null;
  const responseLogContext = {
    ...logContext,
    duration_ms: durationMs,
    status: response.status,
    ok: response.ok,
    response_keys: data && typeof data === "object" ? Object.keys(data).join(",") : "",
    response_body_preview: responseText.slice(0, 500),
  };

  console.info("[Cheyn] Checkout upstream response", responseLogContext);
  logCheynEvent("checkout_upstream_response", responseLogContext, userId);

  if (!response.ok) {
    const upstreamMessage =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : "";
    const message = `Cheyn checkout failed with HTTP ${response.status}${upstreamMessage ? `: ${upstreamMessage}` : ""}`;
    logCheynEvent("checkout_upstream_error", {
      ...responseLogContext,
      has_store_id: Boolean(cheynConfig.storeId),
    }, userId);
    throw new CheynCheckoutError({
      message,
      path: checkoutPath,
      responsePreview: responseText.slice(0, 300),
      status: response.status,
    });
  }

  const checkoutId = data?.id || data?.checkoutId;
  const checkoutUrl = data?.checkoutUrl || data?.url;
  const amountAtomic = data?.amountAtomic;
  if (!checkoutId || !checkoutUrl || !amountAtomic) {
    console.error("[Cheyn] Checkout response missing required fields", {
      ...responseLogContext,
      has_checkout_id: Boolean(checkoutId),
      has_checkout_url: Boolean(checkoutUrl),
      has_amount_atomic: Boolean(amountAtomic),
    });
    logCheynEvent("checkout_invalid_response", {
      ...responseLogContext,
      response_keys: data && typeof data === "object" ? Object.keys(data).join(",") : "",
      has_checkout_id: Boolean(checkoutId),
      has_checkout_url: Boolean(checkoutUrl),
      has_amount_atomic: Boolean(amountAtomic),
    }, userId);
    throw new Error("Cheyn returned an invalid checkout response");
  }

  console.info("[Cheyn] Checkout normalized", {
    checkout_id: checkoutId,
    checkout_url_present: Boolean(checkoutUrl),
    amount_atomic_present: Boolean(amountAtomic),
    status: data.status,
    duration_ms: durationMs,
  });
  logCheynEvent("checkout_normalized", {
    checkout_id_present: true,
    checkout_url_present: Boolean(checkoutUrl),
    amount_atomic_present: Boolean(amountAtomic),
    status: data.status,
    duration_ms: durationMs,
  }, userId);

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

export function verifyMoneroWebhook(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return timingSafeEqualHex(expected, signatureHeader);
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
  return (
    status === "payment.verified" ||
    status === "payout_pending" ||
    status === "payout_sent" ||
    status === "completed"
  );
}

export function calculatePlusExpiry(currentExpiry?: number | null) {
  const base = Math.max(Date.now(), currentExpiry ?? 0);
  return base + CHEYN_PLUS_DURATION_DAYS * 24 * 60 * 60 * 1000;
}
