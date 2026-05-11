import { verifySolution } from 'ribaunt';
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import {
  DEFAULT_CAPTCHA_RESOURCES,
  getSession,
  markSessionVerified,
  verifyResourceLoads,
} from '@/lib/captcha-dispatcher';
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

const secret = new TextEncoder().encode(process.env.RIBAUNT_SECRET!);

async function POSTHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = body.sessionId ?? request.nextUrl.searchParams.get('sessionId') ?? undefined;
    const { tokens, solutions } = body;

    // Verify the CAPTCHA solution
    const isValid = verifySolution(tokens, solutions);

    if (!isValid) {
      captureCaptchaEvent('captcha_solution_invalid', sessionId ?? 'captcha_api', {
        has_session_id: Boolean(sessionId),
      });
      return NextResponse.json(
        { error: 'Invalid solution' },
        { status: 400 }
      );
    }

    const session = sessionId ? getSession(sessionId) : undefined;
    if (session?.isChallenged && session.riskScore >= 55) {
      const resources = verifyResourceLoads(sessionId, DEFAULT_CAPTCHA_RESOURCES);
      if (!resources.passed) {
        captureCaptchaEvent('captcha_resource_proof_required', sessionId, {
          reason: resources.reason,
          riskScore: session.riskScore,
          js_loaded: resources.jsLoaded,
          css_loaded: resources.cssLoaded,
        });
        return NextResponse.json(
          { error: 'Resource verification required before CAPTCHA completion' },
          { status: 400 }
        );
      }
    }

    // Mark the session as verified in anti-abuse system
    if (sessionId) {
      markSessionVerified(sessionId);
      captureCaptchaEvent('captcha_solution_verified', sessionId, {
        risk_score: session?.riskScore,
        requires_resource_proof: Boolean(session?.isChallenged && session.riskScore >= 55),
      });
    }

    // Create a verification JWT valid for 24 hours
    const verificationToken = await new SignJWT({ verified: true, sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    // Set the verification cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set('__ribaunt_verification_key', verificationToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 48, // 48 hours
      path: '/',
    });

    trackCaptchaMonitoringEvent('captcha_verification_cookie_issued', {
      session_id: sessionId,
      max_age_seconds: 60 * 60 * 48,
      same_site: 'strict',
      secure: process.env.NODE_ENV === 'production',
    }, sessionId ?? 'captcha_api');

    return response;
  } catch (error) {
    captureCaptchaEvent('captcha_verify_error', 'captcha_api', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}

export const POST = withAPIObservability(POSTHandler);
