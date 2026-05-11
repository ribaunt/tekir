/**
 * Endpoint to verify that required resources were loaded
 * POST /api/captcha/verify-resources
 * 
 * Called before final CAPTCHA verification to ensure the client
 * is a real browser that can load and execute JavaScript/CSS
 */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CAPTCHA_RESOURCES, verifyResourceLoads, getSession } from '@/lib/captcha-dispatcher';
import { checkRateLimit } from '@/lib/rate-limit';
import { getPostHogServer } from '@/lib/posthog-server';
import { withAPIObservability } from '@/lib/api-observability';
import { toCaptchaMonitoringProperties, trackCaptchaMonitoringEvent } from '@/lib/captcha-monitoring';

function captureCaptchaEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
) {
  trackCaptchaMonitoringEvent(event, toCaptchaMonitoringProperties(properties), distinctId);

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId,
    event,
    properties,
  });
  posthog.flush();
}

async function POSTHandler(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(request, {
      keyPrefix: 'captcha-verify-resources',
      maxRequests: 20,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      captureCaptchaEvent('captcha_verify_resources_rate_limited', 'captcha_api', {
        endpoint: 'verify-resources',
      });
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: new Headers(rateLimit.headers as unknown as Record<string, string>) }
      );
    }

    const body = await request.json();
    const { sessionId, expectedResources } = body;

    if (!sessionId) {
      captureCaptchaEvent('captcha_verify_resources_missing_session', 'captcha_api');
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    // Verify that required resources were loaded
    const verification = verifyResourceLoads(sessionId, expectedResources || DEFAULT_CAPTCHA_RESOURCES);

    if (!verification.passed) {
      captureCaptchaEvent('captcha_verify_resources_failed', sessionId, {
        reason: verification.reason,
      });
      return NextResponse.json(
        {
          passed: false,
          reason: verification.reason,
          details: {
            jsLoaded: verification.jsLoaded,
            cssLoaded: verification.cssLoaded,
          },
        },
        { status: 400 }
      );
    }

    // Get session info
    const session = getSession(sessionId);
    if (!session) {
      captureCaptchaEvent('captcha_verify_resources_session_not_found', sessionId);
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Mark resources as verified, but challenge still needs CAPTCHA solution
    trackCaptchaMonitoringEvent('captcha_resources_verified', {
      session_id: sessionId,
      risk_score: session.riskScore,
      requires_captcha: session.isChallenged,
      js_loaded: verification.jsLoaded,
      css_loaded: verification.cssLoaded,
    }, sessionId);

    return NextResponse.json({
      passed: true,
      reason: 'Resources loaded successfully',
      riskScore: session.riskScore,
      requiresCaptcha: session.isChallenged,
      message: session.isChallenged
        ? 'Resources verified, CAPTCHA solution required'
        : 'Resources verified, proceeding to verification',
    });
  } catch (error) {
    captureCaptchaEvent('captcha_verify_resources_error', 'captcha_api', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: 'Failed to verify resources' },
      { status: 500 }
    );
  }
}

export const POST = withAPIObservability(POSTHandler);
