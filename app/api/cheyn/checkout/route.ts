import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convex-client";
import { CheynCheckoutError, createCheynPlusCheckout, logCheynEvent } from "@/lib/cheyn";
import { getJWTUser } from "@/lib/jwt-auth";
import { handleAPIError } from "@/lib/api-error-tracking";
import { withAPIObservability } from "@/lib/api-observability";

async function POSTHandler(req: NextRequest) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
  };

  try {
    const user = await getJWTUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401, headers });
    }

    const orderId = `tekir_plus_${user.userId}_${Date.now()}`;
    const checkout = await createCheynPlusCheckout({
      origin: req.nextUrl.origin,
      orderId,
      userId: user.userId,
    });

    const convex = getConvexClient();
    await convex.mutation(api.cheyn.createCheckout, {
      checkoutId: checkout.id,
      userId: user.userId as Id<"users">,
      storeId: checkout.storeId,
      orderId,
      status: checkout.status,
      amountAtomic: checkout.amountAtomic,
      currency: checkout.currency,
      pricing: checkout.pricing,
      checkoutUrl: checkout.checkoutUrl,
      expiresAt: checkout.expiresAt,
    });

    logCheynEvent(
      "checkout_created",
      {
        checkout_id_present: true,
        status: checkout.status,
        store_id_present: Boolean(checkout.storeId),
      },
      user.userId
    );

    return NextResponse.json(
      {
        success: true,
        checkoutUrl: checkout.checkoutUrl,
        checkoutId: checkout.id,
      },
      { headers }
    );
  } catch (error) {
    handleAPIError(error, req, "/api/cheyn/checkout", "POST", 500);
    if (error instanceof CheynCheckoutError) {
      return NextResponse.json(
        {
          error: error.message,
          upstreamStatus: error.status,
          upstreamPath: error.path,
          upstreamPreview: error.responsePreview,
        },
        { status: 502, headers }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Cheyn checkout" },
      { status: 500, headers }
    );
  }
}

export const POST = withAPIObservability(POSTHandler);
