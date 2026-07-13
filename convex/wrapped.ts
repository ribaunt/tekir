import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUserWithToken } from "./auth";

/**
 * Get wrapped stats for the authenticated user.
 * Returns aggregated usage data for the year.
 */
export const getWrappedStats = query({
  args: {
    userId: v.id("users"),
    authToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the user is authorized
    const user = await requireUserWithToken(ctx, args.userId, args.authToken);

    if (!user) {
      throw new Error("User not found");
    }

    // Get all sessions for this user to find their deviceIds
    const userSessions = await ctx.db
      .query("sessionTracking")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Collect unique deviceIds from user's sessions
    const deviceIds = new Set<string>();
    for (const session of userSessions) {
      if (session.deviceId) {
        deviceIds.add(session.deviceId);
      }
      if (session.hashedIp) {
        deviceIds.add(session.hashedIp);
      }
    }

    // Calculate date range for the year (2025)
    const yearStart = 20250101; // yyyymmdd format
    const yearEnd = 20251231;

    // Get device daily usage for all the user's devices in the year
    let totalSearches = 0;
    const dailyCounts: Record<number, number> = {};
    const monthCounts: Record<number, number> = {};

    const deviceIdArray = Array.from(deviceIds);
    for (const deviceId of deviceIdArray) {
      const deviceUsage = await ctx.db
        .query("deviceDailyUsage")
        .withIndex("by_day_deviceId")
        .collect();

      for (const usage of deviceUsage) {
        if (usage.deviceId === deviceId && usage.day >= yearStart && usage.day <= yearEnd) {
          totalSearches += usage.count;
          dailyCounts[usage.day] = (dailyCounts[usage.day] || 0) + usage.count;
          
          // Extract month from day (yyyymmdd -> mm)
          const month = Math.floor((usage.day % 10000) / 100);
          monthCounts[month] = (monthCounts[month] || 0) + usage.count;
        }
      }
    }

    // Get feedback count for this user
    const feedbacks = await ctx.db
      .query("feedbacks")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Filter feedbacks to only include those from 2025
    const yearStartTs = new Date("2025-01-01").getTime();
    const yearEndTs = new Date("2025-12-31T23:59:59").getTime();
    const yearFeedbacks = feedbacks.filter(
      (f) => f.createdAt >= yearStartTs && f.createdAt <= yearEndTs
    );

    const likesGiven = yearFeedbacks.filter((f) => f.liked).length;
    const commentsGiven = yearFeedbacks.filter((f) => f.comment).length;

    // Calculate daily average
    const daysWithActivity = Object.keys(dailyCounts).length;
    const dailyAverage = daysWithActivity > 0 ? Math.round(totalSearches / daysWithActivity) : 0;

    // Find most active month
    let mostActiveMonth = 1;
    let mostActiveMonthCount = 0;
    for (const [month, count] of Object.entries(monthCounts)) {
      if (count > mostActiveMonthCount) {
        mostActiveMonthCount = count;
        mostActiveMonth = parseInt(month);
      }
    }

    // Find peak day
    let peakDay = 0;
    let peakDayCount = 0;
    for (const [day, count] of Object.entries(dailyCounts)) {
      if (count > peakDayCount) {
        peakDayCount = count;
        peakDay = parseInt(day);
      }
    }

    // Calculate streak (consecutive days with activity)
    const sortedDays = Object.keys(dailyCounts).map(Number).sort((a, b) => a - b);
    let maxStreak = 0;
    let currentStreak = 1;

    for (let i = 1; i < sortedDays.length; i++) {
      const prevDay = sortedDays[i - 1];
      const currDay = sortedDays[i];
      
      // Check if consecutive (simple check - doesn't account for month boundaries perfectly)
      const prevDate = new Date(
        Math.floor(prevDay / 10000),
        Math.floor((prevDay % 10000) / 100) - 1,
        prevDay % 100
      );
      const currDate = new Date(
        Math.floor(currDay / 10000),
        Math.floor((currDay % 10000) / 100) - 1,
        currDay % 100
      );
      
      const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentStreak++;
      } else {
        maxStreak = Math.max(maxStreak, currentStreak);
        currentStreak = 1;
      }
    }
    maxStreak = Math.max(maxStreak, currentStreak);

    // Everything is open — all users are Plus members.
    const isPlusMember = true;

    // Account age in days
    const accountCreatedAt = user.createdAt;
    const now = Date.now();
    const accountAgeDays = Math.floor((now - accountCreatedAt) / (1000 * 60 * 60 * 24));

    // Month names for display
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    return {
      user: {
        name: user.name || user.username || "Explorer",
        username: user.username,
        isPlusMember,
        accountAgeDays,
        memberSince: new Date(accountCreatedAt).getFullYear(),
      },
      stats: {
        totalSearches,
        dailyAverage,
        daysActive: daysWithActivity,
        longestStreak: maxStreak,
        mostActiveMonth: monthNames[mostActiveMonth - 1] || "January",
        mostActiveMonthCount,
        peakDay: peakDay > 0 ? formatDay(peakDay) : null,
        peakDayCount,
        likesGiven,
        commentsGiven,
        totalFeedbacks: yearFeedbacks.length,
      },
      monthlyBreakdown: Object.entries(monthCounts).map(([month, count]) => ({
        month: monthNames[parseInt(month) - 1],
        count,
      })).sort((a, b) => {
        const monthOrder = monthNames.indexOf(a.month) - monthNames.indexOf(b.month);
        return monthOrder;
      }),
    };
  },
});

// Helper to format day from yyyymmdd to readable format
function formatDay(day: number): string {
  const year = Math.floor(day / 10000);
  const month = Math.floor((day % 10000) / 100);
  const dayOfMonth = day % 100;
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  return `${monthNames[month - 1]} ${dayOfMonth}, ${year}`;
}
