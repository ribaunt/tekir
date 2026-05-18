import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCronSecret } from "./auth";

const STATUS_RANK: Record<string, number> = {
  pending: 10,
  underpaid: 20,
  paid: 30,
  confirming: 40,
  payout_pending: 50,
  payout_sent: 60,
  completed: 70,
};

const TERMINAL_FAILURES = new Set(["expired", "failed", "cancelled"]);

function rankStatus(status: string) {
  if (TERMINAL_FAILURES.has(status)) return 1000;
  return STATUS_RANK[status] ?? 0;
}

export const getCheckoutById = query({
  args: { checkoutId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cheynCheckouts")
      .withIndex("by_checkoutId", (q) => q.eq("checkoutId", args.checkoutId))
      .unique();
  },
});

export const createCheckout = mutation({
  args: {
    checkoutId: v.string(),
    userId: v.id("users"),
    storeId: v.string(),
    orderId: v.string(),
    status: v.string(),
    amountAtomic: v.string(),
    currency: v.string(),
    pricing: v.optional(v.any()),
    checkoutUrl: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cheynCheckouts")
      .withIndex("by_checkoutId", (q) => q.eq("checkoutId", args.checkoutId))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("cheynCheckouts", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const recordWebhookEvent = mutation({
  args: {
    eventId: v.string(),
    checkoutId: v.optional(v.string()),
    storeId: v.optional(v.string()),
    type: v.string(),
    cronSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireCronSecret(args.cronSecret);

    const existing = await ctx.db
      .query("cheynWebhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existing) {
      return { duplicate: true };
    }

    await ctx.db.insert("cheynWebhookEvents", {
      eventId: args.eventId,
      checkoutId: args.checkoutId,
      storeId: args.storeId,
      type: args.type,
      createdAt: Date.now(),
    });

    return { duplicate: false };
  },
});

export const applyCheckoutWebhook = mutation({
  args: {
    checkoutId: v.string(),
    storeId: v.string(),
    status: v.string(),
    amountAtomic: v.string(),
    receivedAtomic: v.optional(v.string()),
    currency: v.string(),
    txHash: v.optional(v.string()),
    pricing: v.optional(v.any()),
    plusAccessExpiresAt: v.optional(v.number()),
    cronSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireCronSecret(args.cronSecret);

    const checkout = await ctx.db
      .query("cheynCheckouts")
      .withIndex("by_checkoutId", (q) => q.eq("checkoutId", args.checkoutId))
      .unique();

    if (!checkout) {
      throw new Error("Cheyn checkout not found");
    }

    const currentRank = rankStatus(checkout.status);
    const nextRank = rankStatus(args.status);
    if (nextRank < currentRank) {
      return {
        applied: false,
        reason: "backwards_transition",
        currentStatus: checkout.status,
      };
    }

    await ctx.db.patch(checkout._id, {
      status: args.status,
      storeId: args.storeId,
      amountAtomic: args.amountAtomic,
      receivedAtomic: args.receivedAtomic,
      currency: args.currency,
      txHash: args.txHash,
      pricing: args.pricing,
      plusAccessExpiresAt: args.plusAccessExpiresAt ?? checkout.plusAccessExpiresAt,
      updatedAt: Date.now(),
    });

    return {
      applied: true,
      userId: checkout.userId,
      currentStatus: args.status,
    };
  },
});
