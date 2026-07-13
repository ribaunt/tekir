import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { registerSessionToken, isConvexConfigured, hashIp, getRateLimitStatus } from '@/lib/convex-session';
import { getJWTUser } from '@/lib/jwt-auth';
import { RATE_LIMITS, getSessionExpiration } from '@/lib/rate-limits';
import { WideEvent } from '@/lib/wide-event';
import { flushServerEvents } from '@/lib/analytics-server';
import { randomUUID } from 'crypto';
import { withAPIObservability } from '@/lib/api-observability';

// Function to get client IP address from request
function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIp) {
    return realIp;
  }

  return null;
}

async function POSTHandler(req: NextRequest) {
  const traceId = randomUUID();
  const startTime = Date.now();
  
  const wideEvent = WideEvent.getOrCreate();
  wideEvent.setRequest({ method: 'POST', path: '/api/session/register' });
  wideEvent.setCustom('trace_id', traceId);
  
  if (!isConvexConfigured) {
    console.warn("Convex is not configured. Cannot register session token via API.");
    wideEvent.setCustom('latency_ms', Date.now() - startTime);
    wideEvent.finish(200);
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
    return NextResponse.json({ success: true, message: "Convex not configured, skipping registration." });
  }

  try {
    // Check if user is authenticated
    const user = await getJWTUser(req);
    const userId = user?.userId || null;
    
    if (userId) {
      wideEvent.setUser({ id: userId });
    }
    
    wideEvent.setCustom('is_authenticated', !!userId);

    const clientIp = getClientIp(req);
    let hashedIpValue: string | null = null;

    if (clientIp) {
      hashedIpValue = hashIp(clientIp);
    } else {
      console.warn("Could not determine client IP address. Session will not be tied to IP.");
    }

    const expirationInSeconds = getSessionExpiration();

    // Derive or create a stable device identifier (opaque random ID)
    let deviceId = req.cookies.get('device-id')?.value || null;
    if (!deviceId) {
      // 16-byte random hex ID
      deviceId = randomBytes(16).toString('hex');
    }
    
    wideEvent.setSession({ new: !req.cookies.get('device-id'), duration_seconds: expirationInSeconds });

    // Pass userId to link session to authenticated user and include deviceId
    const token = await registerSessionToken(hashedIpValue, expirationInSeconds, userId, deviceId);

    if (!token) {
      wideEvent.setError({ type: 'SessionError', message: 'Failed to register session token', code: 'token_registration_failed' });
      wideEvent.setCustom('latency_ms', Date.now() - startTime);
      wideEvent.finish(500);
      flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
      return NextResponse.json({ success: false, error: 'Failed to register session token.' }, { status: 500 });
    }
    
    // Fetch current rate limit status so client can show accurate remaining uses
    let status: { currentCount: number; limit: number; remaining: number; isAuthenticated: boolean } | null = null;
    try {
      const s = await getRateLimitStatus(token);
      status = {
        currentCount: s.currentCount ?? 0,
        limit: s.limit ?? RATE_LIMITS.PLUS_DAILY_LIMIT,
        remaining: s.remaining ?? RATE_LIMITS.PLUS_DAILY_LIMIT,
        isAuthenticated: !!(s.isAuthenticated ?? userId)
      };
    } catch (e) {
      status = {
        currentCount: 0,
        limit: RATE_LIMITS.PLUS_DAILY_LIMIT,
        remaining: RATE_LIMITS.PLUS_DAILY_LIMIT,
        isAuthenticated: !!userId
      };
    }

    const response = NextResponse.json({ 
      success: true, 
      token, 
      message: 'Session token processed.',
      userLinked: !!userId,
      requestLimit: status.limit,
      currentCount: status.currentCount,
      remaining: status.remaining,
      isAuthenticated: status.isAuthenticated
    });
    response.cookies.set('session-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: expirationInSeconds,
      path: '/',
    });
    // Set/update non-HTTP-only device-id cookie (pseudonymous; used only for anti-abuse)
    response.cookies.set('device-id', deviceId!, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
    
    wideEvent.setCustom('latency_ms', Date.now() - startTime);
    wideEvent.finish(200);
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
    
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error("Error in /api/session/register:", error);
    
    wideEvent.setError({ type: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : 'Internal server error', code: 'session_register_error' });
    wideEvent.setCustom('latency_ms', duration);
    wideEvent.finish(500);
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
    
    let errorMessage = "Internal server error.";
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export const POST = withAPIObservability(POSTHandler);
