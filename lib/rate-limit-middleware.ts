import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { incrementAndCheckRequestCount, getRateLimitStatus, registerSessionToken, hashIp } from '@/lib/convex-session';
import { RATE_LIMITS, getSessionExpiration } from '@/lib/rate-limits';

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
function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? null;
}

// Self-heal a missing/invalid session inline so the first request succeeds
// instead of forcing the client through a register -> retry round trip.
// The fresh token is set as a cookie via next/headers, so the browser
// carries it on subsequent requests.
async function provisionSession(request: NextRequest): Promise<string | null> {
  try {
    const clientIp = getClientIp(request);
    const hashedIp = clientIp ? hashIp(clientIp) : null;
    const expirationInSeconds = getSessionExpiration();
    let deviceId = request.cookies.get('device-id')?.value || null;
    if (!deviceId) {
      deviceId = randomBytes(16).toString('hex');
    }
    const token = await registerSessionToken(hashedIp, expirationInSeconds, null, deviceId);
    if (!token) return null;
    const cookieStore = await cookies();
    cookieStore.set('session-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: expirationInSeconds,
      path: '/',
    });
    cookieStore.set('device-id', deviceId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return token;
  } catch {
    return null;
  }
}

export async function checkRateLimit(
  request: NextRequest,
  routeName: string = 'API'
): Promise<RateLimitResult> {
  // Check for session token
  let sessionToken = request.cookies.get('session-token')?.value;

  if (!sessionToken) {
    const provisioned = await provisionSession(request);
    if (provisioned) {
      sessionToken = provisioned;
    } else {
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Session token required' },
          { status: 401, headers: getRateLimitHeaders(RATE_LIMITS.PLUS_DAILY_LIMIT, false) }
        ),
      };
    }
  }

  let status = await getRateLimitStatus(sessionToken);

  if (!status.isValid) {
    const provisioned = await provisionSession(request);
    if (provisioned) {
      sessionToken = provisioned;
      status = await getRateLimitStatus(sessionToken);
    }
    if (!status.isValid) {
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Invalid or expired session token' },
          { status: 401, headers: getRateLimitHeaders(RATE_LIMITS.PLUS_DAILY_LIMIT, false) }
        ),
      };
    }
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
