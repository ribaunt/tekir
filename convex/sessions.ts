import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { yyyymmdd } from "./usage";
import { requireAdmin, requireAuth } from "./auth";

// Rate limiting constants
const RATE_LIMITS = {
  ANONYMOUS_DAILY_LIMIT: 150,
  AUTHENTICATED_DAILY_LIMIT: 300,
  PLUS_DAILY_LIMIT: 600, // Tekir Plus members get significantly higher limits
  SESSION_EXPIRATION_SECONDS: 24 * 60 * 60, // 24 hours
  RESET_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
} as const;

const scheduleLog = (
  ctx: unknown,
  args: { level: string; message: string; metadataJson?: string }
) => {
  const scheduler = (ctx as { scheduler?: { runAfter: Function } }).scheduler;
  if (!scheduler) return;
  scheduler.runAfter(0, internal.logging.logServerEvent, args);
};

// Helper to get user limit — all users now get the highest (Plus) limit.
async function getUserLimit(_ctx: any, _userId: any): Promise<number> {
  return RATE_LIMITS.PLUS_DAILY_LIMIT;
}

// Session tracking for rate limiting (replaces Redis functionality)

export const getSessionByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessionTracking")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.token))
      .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
      .first();

    return session;
  },
});

export const registerSessionToken = mutation({
  args: {
    sessionToken: v.string(),
    hashedIp: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    expirationInSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expirationInSeconds = args.expirationInSeconds || RATE_LIMITS.SESSION_EXPIRATION_SECONDS;
    const expiresAt = Date.now() + (expirationInSeconds * 1000);

    // For authenticated users, priority is user-based session
    if (args.userId) {
      // Check for existing user session first
      const existingUserSession = await ctx.db
        .query("sessionTracking")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
        .first();

      if (existingUserSession) {
        // Return existing session token for this user (fingerprinting behavior)
        await ctx.db.patch(existingUserSession._id, {
          expiresAt, // Extend expiration
          deviceId: existingUserSession.deviceId || args.deviceId, // attach device if missing
        });
        return existingUserSession.sessionToken;
      }

      // Create new authenticated session
      await ctx.db.insert("sessionTracking", {
        sessionToken: args.sessionToken,
        hashedIp: args.hashedIp,
        deviceId: args.deviceId,
        userId: args.userId,
        requestCount: 0,
        expiresAt,
        isActive: true,
      });


      return args.sessionToken;
    }

    // For unauthenticated users, check by hashed IP
    if (args.hashedIp) {
      const existingIpSession = await ctx.db
        .query("sessionTracking")
        .withIndex("by_hashedIp", (q) => q.eq("hashedIp", args.hashedIp))
        .filter((q) =>
          q.and(
            q.gt(q.field("expiresAt"), Date.now()),
            q.eq(q.field("userId"), undefined) // Only consider unauthenticated sessions
          )
        )
        .first();

      if (existingIpSession) {
        // Return existing session token for this IP (fingerprinting behavior)
        await ctx.db.patch(existingIpSession._id, {
          expiresAt, // Extend expiration
          deviceId: existingIpSession.deviceId || args.deviceId, // attach if missing
        });
        return existingIpSession.sessionToken;
      }
    }

    // Create new unauthenticated session
    await ctx.db.insert("sessionTracking", {
      sessionToken: args.sessionToken,
      hashedIp: args.hashedIp,
      deviceId: args.deviceId,
      userId: args.userId,
      requestCount: 0,
      expiresAt,
      isActive: true,
    });


    return args.sessionToken;
  },
});

export const isValidSessionToken = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessionTracking")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .unique();

    if (!session) {
      return { isValid: false, session: null };
    }

    const isExpired = session.expiresAt <= Date.now();
    const isValid = session.isActive && !isExpired;

    return { isValid, session: isValid ? session : null };
  },
});

// Query to check current rate limit status without incrementing
export const getRateLimitStatus = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessionTracking")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .unique();

    if (!session) {
      return {
        isValid: false,
        currentCount: 0,
        limit: RATE_LIMITS.ANONYMOUS_DAILY_LIMIT,
        remaining: 0,
        isAuthenticated: false
      };
    }

    const isExpired = session.expiresAt <= Date.now();
    if (isExpired || !session.isActive) {
      const limit = await getUserLimit(ctx, session.userId);
      return {
        isValid: false,
        currentCount: session.requestCount,
        limit,
        remaining: 0,
        isAuthenticated: !!session.userId
      };
    }

    const limit = await getUserLimit(ctx, session.userId);
    const sessionRemaining = Math.max(0, limit - session.requestCount);

    // Enforce per-device daily cap across auth/anon
    let deviceRemainingNum = Number(limit); // Use user's limit as device cap
    const deviceKey = session.deviceId || session.hashedIp;
    if (deviceKey) {
      try {
        const day = yyyymmdd(Date.now());
        const du = await ctx.db
          .query('deviceDailyUsage')
          .withIndex('by_day_deviceId', q => q.eq('day', day).eq('deviceId', deviceKey))
          .first();
        const deviceCount = du?.count ?? 0;
        deviceRemainingNum = Math.max(0, Number(limit) - deviceCount);
      } catch { }
    }

    const remaining = Math.min(sessionRemaining, deviceRemainingNum);

    return {
      isValid: true,
      currentCount: session.requestCount,
      limit, // session-level limit (UI displays limit per state)
      remaining,
      isAuthenticated: !!session.userId,
      resetTime: new Date(Date.now() + RATE_LIMITS.RESET_INTERVAL_MS).toISOString()
    };
  },
});

export const incrementAndCheckRequestCount = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessionTracking")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .unique();

    if (!session) {
      return { allowed: false, currentCount: 0 };
    }

    const isExpired = session.expiresAt <= Date.now();
    if (isExpired) {
      return { allowed: false, currentCount: session.requestCount };
    }

    const maxRequests = await getUserLimit(ctx, session.userId);
    const deviceCap: number = await getUserLimit(ctx, session.userId); // Use user's limit as device cap

    // Load device usage if we have a device key
    const deviceKey = session.deviceId || session.hashedIp;
    let deviceCount = 0;
    let deviceDailyDocId: string | null = null as any;
    const today = yyyymmdd(Date.now());
    if (deviceKey) {
      const du = await ctx.db
        .query('deviceDailyUsage')
        .withIndex('by_day_deviceId', q => q.eq('day', today).eq('deviceId', deviceKey))
        .first();
      if (du) {
        deviceCount = du.count;
        deviceDailyDocId = du._id as any;
      }
    }

    // Pre-calculate if request would be allowed
    const newCount = session.requestCount + 1;
    const wouldBeAllowed = newCount <= maxRequests && (!deviceKey || (deviceCount + 1) <= deviceCap);

    if (wouldBeAllowed) {
      try {
        await ctx.db.patch(session._id, { requestCount: newCount });
        // Increment device usage atomically
        if (deviceKey) {
          if (deviceDailyDocId) {
            await ctx.db.patch(deviceDailyDocId as any, { count: deviceCount + 1 });
          } else {
            await ctx.db.insert('deviceDailyUsage', { day: today, deviceId: deviceKey, count: 1 });
          }
        }
        // Count API hit on allowed request
        try {
          const day = yyyymmdd(Date.now());
          const existing = await ctx.db
            .query('apiHitsDaily')
            .withIndex('by_day', q => q.eq('day', day))
            .first();
          if (existing) await ctx.db.patch(existing._id, { count: existing.count + 1 });
          else await ctx.db.insert('apiHitsDaily', { day, count: 1 });
        } catch { }

        return {
          allowed: true,
          currentCount: newCount,
        };
      } catch (error) {
        // If patch fails due to concurrent modification, read current state and return
        const updatedSession = await ctx.db.get(session._id);
        if (!updatedSession) {
          return { allowed: false, currentCount: 0 };
        }

        // Return current state without retrying the increment to avoid further conflicts
        return {
          allowed: updatedSession.requestCount < maxRequests,
          currentCount: updatedSession.requestCount,
        };
      }
    } else {
      // Request would exceed limit, don't increment
      return {
        allowed: false,
        currentCount: session.requestCount,
      };
    }
  },
});

export const linkSessionToUser = mutation({
  args: {
    sessionToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify that the authenticated user matches the requested userId
    const identity = await requireAuth(ctx);

    // We need to fetch the user to check if the identity email matches the user's email
    // This is because args.userId is an ID, but identity only gives us email/subject
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.email !== identity.email) {
      throw new Error("Unauthorized: You can only link sessions to your own account");
    }

    const session = await ctx.db
      .query("sessionTracking")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .unique();

    if (!session) {
      return null;
    }

    // Check if user already has an authenticated session
    const existingUserSession = await ctx.db
      .query("sessionTracking")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
      .first();

    if (existingUserSession && existingUserSession._id !== session._id) {
      // User already has a session, deactivate the current anonymous session
      // and return the existing user session token
      await ctx.db.patch(session._id, {
        isActive: false,
      });
      // Ensure existing user session is associated with the same device when possible
      if (!existingUserSession.deviceId && session.deviceId) {
        try {
          await ctx.db.patch(existingUserSession._id, { deviceId: session.deviceId });
        } catch { }
      }

      // Return the existing user session token for fingerprinting
      return existingUserSession.sessionToken;
    }

    // Link the current session to the user
    await ctx.db.patch(session._id, {
      userId: args.userId,
    });

    return session.sessionToken;
  },
});

export const getOrCreateSessionToken = mutation({
  args: {
    hashedIp: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    expirationInSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expirationInSeconds = args.expirationInSeconds || RATE_LIMITS.SESSION_EXPIRATION_SECONDS;
    const expiresAt = Date.now() + (expirationInSeconds * 1000);

    // For authenticated users, always return their existing session token if available
    if (args.userId) {
      const existingUserSession = await ctx.db
        .query("sessionTracking")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
        .first();

      if (existingUserSession) {
        // Only extend expiration if it's significantly shorter than requested
        const timeUntilExpiry = existingUserSession.expiresAt - Date.now();
        const halfRequestedTime = (expirationInSeconds * 1000) / 2;

        if (timeUntilExpiry < halfRequestedTime) {
          try {
            await ctx.db.patch(existingUserSession._id, { expiresAt, deviceId: existingUserSession.deviceId || args.deviceId });
          } catch (error) {
            // If patch fails, still return the existing token
            scheduleLog(ctx, {
              level: 'warn',
              message: 'Failed to extend session expiration, but returning existing token',
            });
          }
        }

        const limit = await getUserLimit(ctx, args.userId);
        return {
          sessionToken: existingUserSession.sessionToken,
          isExisting: true,
          requestLimit: limit,
        };
      }

      // Create new authenticated session with unique token to avoid conflicts
      const sessionToken = generateSessionToken();
      try {
        await ctx.db.insert("sessionTracking", {
          sessionToken,
          hashedIp: args.hashedIp,
          deviceId: args.deviceId,
          userId: args.userId,
          requestCount: 0,
          expiresAt,
          isActive: true,
        });

        const limit = await getUserLimit(ctx, args.userId);
        return {
          sessionToken,
          isExisting: false,
          requestLimit: limit,
        };
      } catch (error) {
        // If insert fails, try to find if a session was created concurrently
        const concurrentSession = await ctx.db
          .query("sessionTracking")
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
          .first();

        if (concurrentSession) {
          const limit = await getUserLimit(ctx, args.userId);
          return {
            sessionToken: concurrentSession.sessionToken,
            isExisting: true,
            requestLimit: limit,
          };
        }

        // If still failing, rethrow the error
        throw error;
      }
    }

    // For unauthenticated users, check by hashed IP for fingerprinting
    if (args.hashedIp) {
      const existingIpSession = await ctx.db
        .query("sessionTracking")
        .withIndex("by_hashedIp", (q) => q.eq("hashedIp", args.hashedIp))
        .filter((q) =>
          q.and(
            q.gt(q.field("expiresAt"), Date.now()),
            q.eq(q.field("userId"), undefined) // Only unauthenticated sessions
          )
        )
        .first();

      if (existingIpSession) {
        // Only extend expiration if it's significantly shorter than requested  
        const timeUntilExpiry = existingIpSession.expiresAt - Date.now();
        const halfRequestedTime = (expirationInSeconds * 1000) / 2;

        if (timeUntilExpiry < halfRequestedTime) {
          try {
            await ctx.db.patch(existingIpSession._id, { expiresAt, deviceId: existingIpSession.deviceId || args.deviceId });
          } catch (error) {
            // If patch fails, still return the existing token
            scheduleLog(ctx, {
              level: 'warn',
              message: 'Failed to extend session expiration, but returning existing token',
            });
          }
        }

        return {
          sessionToken: existingIpSession.sessionToken,
          isExisting: true,
          requestLimit: RATE_LIMITS.PLUS_DAILY_LIMIT,
        };
      }
    }

    // Create new unauthenticated session
    const sessionToken = generateSessionToken();
    await ctx.db.insert("sessionTracking", {
      sessionToken,
      hashedIp: args.hashedIp,
      deviceId: args.deviceId,
      userId: args.userId,
      requestCount: 0,
      expiresAt,
      isActive: true,
    });

    return {
      sessionToken,
      isExisting: false,
      requestLimit: RATE_LIMITS.PLUS_DAILY_LIMIT,
    };
  },
});

// Helper function to generate cryptographically secure session tokens
function generateSessionToken(): string {
  // Use Web Crypto API for cryptographically secure random values
  // This works in Convex's JavaScript runtime environment
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  // Convert to hex string (64 characters)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export const cleanExpiredSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const currentTime = Date.now();

    // Find expired sessions in batches to avoid large transactions
    const expiredSessions = await ctx.db
      .query("sessionTracking")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", currentTime))
      .take(100); // Process in batches of 100

    let deletedCount = 0;

    // Delete expired sessions one by one to avoid conflicts
    for (const session of expiredSessions) {
      try {
        await ctx.db.delete(session._id);
        deletedCount++;
      } catch (error) {
        // If deletion fails (e.g., already deleted), continue with others
        scheduleLog(ctx, {
          level: 'warn',
          message: `Failed to delete expired session ${session._id}`,
          metadataJson: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    }

    return {
      deletedCount,
      hasMore: expiredSessions.length === 100 // Indicates if there might be more to clean
    };
  },
});

// New mutation to reset daily request counts (can be called by a cron job)
export const resetDailyRequestCounts = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const currentTime = Date.now();
    // Process in batches until there are no more sessions to reset.
    // The previous implementation only processed a single batch of 50,
    // which meant many sessions were never reset. Looping here ensures
    // the cron run clears all matching sessions (within mutation limits).
    const batchSize = 200;
    let resetCount = 0;

    while (true) {
      const sessionsToReset = await ctx.db
        .query("sessionTracking")
        .filter((q) =>
          q.and(
            q.gt(q.field("expiresAt"), currentTime), // Still valid
            q.eq(q.field("isActive"), true), // Still active
            q.gt(q.field("requestCount"), 0) // Has requests to reset
          )
        )
        .take(batchSize);

      if (!sessionsToReset || sessionsToReset.length === 0) {
        break;
      }

      for (const session of sessionsToReset) {
        try {
          await ctx.db.patch(session._id, { requestCount: 0 });
          resetCount++;
        } catch (error) {
          scheduleLog(ctx, {
            level: 'warn',
            message: `Failed to reset request count for session ${session._id}`,
            metadataJson: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          });
        }
      }

      // If fewer than a full batch were returned, we've cleared all matches.
      if (sessionsToReset.length < batchSize) break;

      // Safety break to prevent timeouts
      if (resetCount > 5000) {
        scheduleLog(ctx, {
          level: 'warn',
          message: 'Reset limit reached for single execution',
        });
        return {
          resetCount,
          hasMore: true
        }
      }
    }

    return {
      resetCount,
      hasMore: false,
    };
  },
});

// Internal mutation to reset daily request counts (called by cron jobs, no auth required)
export const resetDailyRequestCountsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const currentTime = Date.now();
    // Process in batches until there are no more sessions to reset.
    const batchSize = 200;
    let resetCount = 0;

    while (true) {
      const sessionsToReset = await ctx.db
        .query("sessionTracking")
        .filter((q) =>
          q.and(
            q.gt(q.field("expiresAt"), currentTime), // Still valid
            q.eq(q.field("isActive"), true), // Still active
            q.gt(q.field("requestCount"), 0) // Has requests to reset
          )
        )
        .take(batchSize);

      if (sessionsToReset.length === 0) {
        break;
      }

      for (const session of sessionsToReset) {
        await ctx.db.patch(session._id, {
          requestCount: 0,
        });
        resetCount++;
      }

      // Safety check: prevent runaway loops
      if (resetCount > 10000) {
        scheduleLog(ctx, {
          level: 'warn',
          message: 'Reset limit reached for single execution',
        });
        return {
          resetCount,
          hasMore: true
        }
      }
    }

    return {
      resetCount,
      hasMore: false,
    };
  },
});
