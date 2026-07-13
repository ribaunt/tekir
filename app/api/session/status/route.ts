import { NextRequest, NextResponse } from 'next/server';
import { getRateLimitStatus } from '@/lib/convex-session';
import { RATE_LIMITS } from '@/lib/rate-limits';
import { getJWTUser } from '@/lib/jwt-auth';
import { WideEvent } from '@/lib/wide-event';
import { flushServerEvents, trackServerLog } from '@/lib/analytics-server';
import { randomUUID } from 'crypto';
import { withAPIObservability } from '@/lib/api-observability';

async function GETHandler(req: NextRequest) {
  const traceId = randomUUID();
  const startTime = Date.now();
  
  const wideEvent = WideEvent.getOrCreate();
  wideEvent.setRequest({ method: 'GET', path: '/api/session/status' });
  wideEvent.setCustom('trace_id', traceId);
  
  trackServerLog('session_status_check_request', {
    trace_id: traceId,
  });

  try {
    const token = req.cookies.get('session-token')?.value;
    if (!token) {
      trackServerLog('session_token_missing', {
        trace_id: traceId,
      });
      wideEvent.setError({ type: 'SessionError', message: 'Session token required', code: 'no_token' });
      wideEvent.finish(401);
      flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
      return NextResponse.json({ error: 'Session token required' }, { status: 401 });
    }

    const jwtUser = await getJWTUser(req);
    const isActuallyAuthenticated = !!jwtUser;
    
    if (jwtUser) {
      wideEvent.setUser({ id: jwtUser.userId });
    }
    
    wideEvent.setCustom('is_authenticated', isActuallyAuthenticated);

    trackServerLog('session_jwt_auth_status', {
      trace_id: traceId,
      is_authenticated: isActuallyAuthenticated,
      has_user_id: Boolean(jwtUser?.userId),
    }, jwtUser?.userId);

    const s: any = await getRateLimitStatus(token);
    if (!s || !s.isValid) {
      trackServerLog('session_token_invalid', {
        trace_id: traceId,
      }, jwtUser?.userId);
      wideEvent.setError({ type: 'SessionError', message: 'Invalid or expired session token', code: 'invalid_token' });
      wideEvent.setCustom('latency_ms', Date.now() - startTime);
      wideEvent.finish(401);
      flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
      return NextResponse.json({ error: 'Invalid or expired session token' }, { status: 401 });
    }

    trackServerLog('session_token_valid', {
      trace_id: traceId,
      current_count: s.currentCount,
      remaining: s.remaining,
    }, jwtUser?.userId);

    // All users share the same Plus limit — everything is open.
    const limit = RATE_LIMITS.PLUS_DAILY_LIMIT;
    const current = typeof s.currentCount === 'number' ? s.currentCount : 0;
    const remaining = typeof s.remaining === 'number' ? Math.min(s.remaining, limit - current) : limit;
    const clamped = Math.max(0, remaining);

    trackServerLog('session_rate_limit_status', {
      trace_id: traceId,
      limit,
      remaining: clamped,
      current,
    }, jwtUser?.userId);
    
    wideEvent.setCustom('limit', limit);
    wideEvent.setCustom('remaining', clamped);
    wideEvent.setCustom('current_count', current);
    wideEvent.setCustom('latency_ms', Date.now() - startTime);
    wideEvent.finish(200);
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));

    return NextResponse.json({
      limit,
      remaining: clamped,
      currentCount: current,
      isAuthenticated: isActuallyAuthenticated,
    });
  } catch (e: any) {
    const duration = Date.now() - startTime;
    
    console.error(`[Session] Error checking status:`, e?.message || e);
    
    wideEvent.setError({ type: e?.name || 'UnknownError', message: e?.message || 'Internal Server Error', code: 'session_status_error' });
    wideEvent.setCustom('latency_ms', duration);
    wideEvent.finish(500);
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
    
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export const GET = withAPIObservability(GETHandler);
