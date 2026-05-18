import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { getJWTUser } from "@/lib/jwt-auth";
import { withAPIObservability } from "@/lib/api-observability";

async function GETHandler(req: NextRequest) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
  };

  const jwtUser = await getJWTUser(req);
  if (!jwtUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers });
  }

  const checkoutId = req.nextUrl.searchParams.get("checkoutId");
  if (!checkoutId) {
    return NextResponse.json({ error: "checkoutId is required" }, { status: 400, headers });
  }

  const checkout = await getConvexClient().query(api.cheyn.getCheckoutById, { checkoutId });
  if (!checkout || String(checkout.userId) !== String(jwtUser.userId)) {
    return NextResponse.json({ error: "Checkout not found" }, { status: 404, headers });
  }

  return NextResponse.json(
    {
      checkoutId: checkout.checkoutId,
      status: checkout.status,
      amountAtomic: checkout.amountAtomic,
      receivedAtomic: checkout.receivedAtomic,
      currency: checkout.currency,
      txHash: checkout.txHash,
      pricing: checkout.pricing,
      plusAccessExpiresAt: checkout.plusAccessExpiresAt,
      updatedAt: checkout.updatedAt,
    },
    { headers }
  );
}

export const GET = withAPIObservability(GETHandler);
