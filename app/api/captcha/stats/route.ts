/**
 * Admin endpoint for CAPTCHA system monitoring and statistics
 * GET /api/captcha/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getChallengeStats, getSession } from '@/lib/captcha-dispatcher';
import { getPostHogServer } from '@/lib/posthog-server';
import { withAPIObservability } from '@/lib/api-observability';
import { toCaptchaMonitoringProperties, trackCaptchaMonitoringEvent } from '@/lib/captcha-monitoring';

function captureCaptchaEvent(
  event: string,
  properties: Record<string, unknown> = {},
) {
  trackCaptchaMonitoringEvent(event, toCaptchaMonitoringProperties(properties), 'captcha_admin');

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: 'captcha_admin',
    event,
    properties,
  });
  posthog.flush();
}

// Simple auth check - in production, use proper admin authentication
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const adminToken = process.env.CAPTCHA_ADMIN_TOKEN;

  if (!adminToken) {
    return false; // No admin token configured, deny access
  }

  return authHeader === `Bearer ${adminToken}`;
}

async function GETHandler(request: NextRequest) {
  // Check authorization
  if (!isAuthorized(request)) {
    trackCaptchaMonitoringEvent('captcha_stats_unauthorized', {
      method: 'GET',
      has_admin_token_configured: Boolean(process.env.CAPTCHA_ADMIN_TOKEN),
    }, 'captcha_admin');

    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const stats = getChallengeStats();
    trackCaptchaMonitoringEvent('captcha_stats_viewed', {
      total_sessions: stats.totalSessions,
      active_sessions: stats.activeSessions,
      challenged_sessions: stats.challengedSessions,
      verified_sessions: stats.verifiedSessions,
      average_risk_score: stats.averageRiskScore,
    }, 'captcha_admin');

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      stats,
    });
  } catch (error) {
    captureCaptchaEvent('captcha_stats_error', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: 'Failed to retrieve stats' },
      { status: 500 }
    );
  }
}

// Endpoint to check a specific session (for debugging)
async function POSTHandler(request: NextRequest) {
  if (!isAuthorized(request)) {
    trackCaptchaMonitoringEvent('captcha_stats_unauthorized', {
      method: 'POST',
      has_admin_token_configured: Boolean(process.env.CAPTCHA_ADMIN_TOKEN),
    }, 'captcha_admin');

    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      trackCaptchaMonitoringEvent('captcha_session_check_rejected', {
        reason: 'missing_session_id',
      }, 'captcha_admin');

      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    const session = getSession(sessionId);

    if (!session) {
      trackCaptchaMonitoringEvent('captcha_session_check_rejected', {
        reason: 'session_not_found',
        session_id: sessionId,
      }, 'captcha_admin');

      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    trackCaptchaMonitoringEvent('captcha_session_checked', {
      session_id: session.id,
      risk_score: session.riskScore,
      is_challenged: session.isChallenged,
      verified: session.verified,
      js_resource_count: session.resourcesLoadTracker.jsLoaded.size,
      css_resource_count: session.resourcesLoadTracker.cssLoaded.size,
    }, 'captcha_admin');

    return NextResponse.json({
      sessionId: session.id,
      timestamp: new Date(session.timestamp).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      userAgent: session.userAgent,
      riskScore: session.riskScore,
      isChallenged: session.isChallenged,
      verified: session.verified,
      resourcesLoaded: {
        js: Array.from(session.resourcesLoadTracker.jsLoaded),
        css: Array.from(session.resourcesLoadTracker.cssLoaded),
      },
    });
  } catch (error) {
    captureCaptchaEvent('captcha_session_check_error', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: 'Failed to retrieve session' },
      { status: 500 }
    );
  }
}

export const GET = withAPIObservability(GETHandler);
export const POST = withAPIObservability(POSTHandler);
