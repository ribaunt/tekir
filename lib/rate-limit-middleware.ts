import { NextRequest, NextResponse } from 'next/server';
import { isValidSessionToken, incrementAndCheckRequestCount, getRateLimitStatus } from '@/lib/convex-session';
import { RATE_LIMITS } from '@/lib/rate-limits';

interface RateLimitResult {
  success: boolean;
  response?: NextResponse;
  sessionToken?: string;
  currentCount?: number;
}

/**
 * Middleware function to check session token and rate limits for API routes
 * Returns success: true if request should proceed, or success: false with error response
 */
export async function checkRateLimit(
  request: NextRequest,
  routeName: string = 'API'
): Promise<RateLimitResult> {
  // Check for session token
  const sessionToken = request.cookies.get('session-token')?.value;
  
  if (!sessionToken) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Session token required' },
        { status: 401, headers: getRateLimitHeaders(RATE_LIMITS.PLUS_DAILY_LIMIT, false) }
      ),
    };
  }

  const status = await getRateLimitStatus(sessionToken);
  
  if (!status.isValid) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Invalid or expired session token' },
        { status: 401, headers: getRateLimitHeaders(RATE_LIMITS.PLUS_DAILY_LIMIT, false) }
      ),
    };
  }

  // If already at limit, don't bother trying to increment
  if (status.remaining <= 0) {
    console.warn(`Session token ${sessionToken} exceeded request limit for ${routeName}. Count: ${status.currentCount}`);
    
    const resetTime = 'resetTime' in status ? status.resetTime : new Date(Date.now() + RATE_LIMITS.RESET_INTERVAL_MS).toISOString();
    
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Rate limit exceeded',
          currentCount: status.currentCount,
          resetTime,
          message: 'Daily request limit reached. Limit resets at midnight UTC.',
        },
        { 
          status: 429,
          headers: getRateLimitHeaders(status.currentCount, status.isAuthenticated)
        }
      ),
    };
  }

  // Now try to increment the count (mutation operation)
  const { allowed, currentCount } = await incrementAndCheckRequestCount(sessionToken);
  
  if (!allowed) {
    console.warn(`Session token ${sessionToken} exceeded request limit for ${routeName}. Count: ${currentCount}`);
    
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Rate limit exceeded',
          currentCount,
          resetTime: new Date(Date.now() + RATE_LIMITS.RESET_INTERVAL_MS).toISOString(),
          message: 'Daily request limit reached. Limit resets at midnight UTC.',
        },
        { 
          status: 429,
          headers: getRateLimitHeaders(currentCount, status.isAuthenticated)
        }
      ),
    };
  }

  return {
    success: true,
    sessionToken,
    currentCount,
  };
}

/**
 * Response headers for rate-limited endpoints
 */
export function getRateLimitHeaders(currentCount: number, _isAuthenticated: boolean = false) {
  const limit = RATE_LIMITS.PLUS_DAILY_LIMIT;
  const remaining = Math.max(0, limit - currentCount);
  const resetTime = new Date();
  resetTime.setUTCHours(24, 0, 0, 0); // Next midnight UTC

  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.floor(resetTime.getTime() / 1000).toString(),
    'X-RateLimit-Reset-Time': resetTime.toISOString(),
  };
}
