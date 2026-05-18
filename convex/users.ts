import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdmin, requireAdminWithToken, requireCronSecret, requireUser } from "./auth";

// Queries
export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const getUserByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
  },
});

export const getUserById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getUserByVerificationToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_emailVerificationToken", (q) => q.eq("emailVerificationToken", args.token))
      .unique();
  },
});

export const getUserByPolarCustomerId = query({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_polarCustomerId", (q) => q.eq("polarCustomerId", args.polarCustomerId))
      .unique();
  },
});

// Admin: list users (recent first)
export const listUsers = query({
  args: { authToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdminWithToken(args.authToken);

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const items = await ctx.db
      .query("users")
      .order("desc")
      .collect();
    return items.slice(0, limit);
  },
});

// Admin: count users
export const countUsers = query({
  args: {
    authToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminWithToken(args.authToken);
    const all = await ctx.db.query("users").collect();
    return all.length;
  },
});

// Internal: list users with 'paid' role (for subscription validation cron)
export const listPaidUsers = query({
  args: {},
  handler: async (ctx) => {
    // Get all users and filter for those with 'paid' role
    const users = await ctx.db.query("users").collect();
    return users.filter(user => 
      user.roles && user.roles.some((role: string) => role.toLowerCase() === 'paid')
    );
  },
});

// Mutations
export const createUser = mutation({
  args: {
    username: v.string(),
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    imageType: v.optional(v.string()),
    roles: v.optional(v.array(v.string())),
    emailVerificationToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Enforce password hashing
    if (!args.password.startsWith("$2")) {
      throw new Error("Password must be hashed before storage");
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      ...args,
      settingsSync: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateUser = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.float64()),
    emailVerificationToken: v.optional(v.string()),
    password: v.optional(v.string()),
    image: v.optional(v.string()),
    imageType: v.optional(v.string()),
    roles: v.optional(v.array(v.string())),
    settingsSync: v.optional(v.boolean()),
    settings: v.optional(v.any()),
    polarCustomerId: v.optional(v.string()),
    cheynPlusExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Authentication is handled by API routes via getJWTUser() before calling this mutation.
    // This mutation trusts that the caller has already verified the user's identity.
    // For admin operations, use updateUserRoles which has its own auth checks.

    const { id, ...updateData } = args;

    // Enforce password hashing if password is being updated
    if (updateData.password && !updateData.password.startsWith("$2")) {
      throw new Error("Password must be hashed before storage");
    }

    const updates = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined)
    );

    return await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const grantCheynPlusAccess = mutation({
  args: {
    id: v.id("users"),
    plusAccessExpiresAt: v.number(),
    cronSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireCronSecret(args.cronSecret);

    const user = await ctx.db.get(args.id);
    if (!user) {
      throw new Error("User not found");
    }

    const currentRoles = user.roles ?? [];
    const hasPaid = currentRoles.some((role: string) => role.toLowerCase() === "paid");
    const roles = hasPaid ? currentRoles : [...currentRoles, "paid"];
    const existingExpiry = user.cheynPlusExpiresAt ?? 0;

    return await ctx.db.patch(args.id, {
      roles,
      cheynPlusExpiresAt: Math.max(existingExpiry, args.plusAccessExpiresAt),
      updatedAt: Date.now(),
    });
  },
});

export const updateUserRoles = mutation({
  args: {
    id: v.id("users"),
    roles: v.array(v.string()),
    // Optional: allow internal server/cron callers to authenticate via shared secret.
    // Browser/admin UI should continue using authToken-based auth.
    cronSecret: v.optional(v.string()),
    authToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.authToken) {
      await requireAdminWithToken(args.authToken);
    } else {
      requireCronSecret(args.cronSecret);
    }
    return await ctx.db.patch(args.id, {
      roles: args.roles,
      updatedAt: Date.now(),
    });
  },
});

export const deleteUser = mutation({
  args: { authToken: v.string(), id: v.id("users") },
  handler: async (ctx, args) => {
    // Only admin can delete users for now
    await requireAdminWithToken(args.authToken);

    // Delete related data first

    const sessionTracking = await ctx.db
      .query("sessionTracking")
      .withIndex("by_userId", (q) => q.eq("userId", args.id))
      .collect();

    for (const tracking of sessionTracking) {
      await ctx.db.delete(tracking._id);
    }

    // Delete the user
    return await ctx.db.delete(args.id);
  },
});

export const verifyEmail = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    return await ctx.db.patch(user._id, {
      emailVerified: Date.now(),
      emailVerificationToken: undefined,
      updatedAt: Date.now(),
    });
  },
});
