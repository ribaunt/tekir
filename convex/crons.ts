import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Run resetDailyRequestCounts shortly after midnight UTC every day
// Using internal mutation since cron jobs don't have auth context
crons.cron("daily-reset-request-counts", "5 0 * * *", internal.sessions.resetDailyRequestCountsInternal);

// Also run cleanExpiredSessions every hour to keep the table small
crons.interval("hourly-clean-expired-sessions", { hours: 1 }, api.sessions.cleanExpiredSessions);

export default crons;
