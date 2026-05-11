/**
 * API endpoint for challenge generation with anti-abuse analysis
 * GET /api/captcha/challenge-request
 */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CAPTCHA_RESOURCES, dispatchChallenge } from '@/lib/captcha-dispatcher';
import { getPostHogServer } from '@/lib/posthog-server';
import { withAPIObservability } from '@/lib/api-observability';
import { toCaptchaMonitoringProperties, trackCaptchaMonitoringEvent } from '@/lib/captcha-monitoring';

function captureCaptchaEvent(
  event: string,
  properties: Record<string, unknown> = {},
) {
  trackCaptchaMonitoringEvent(event, toCaptchaMonitoringProperties(properties));

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: 'captcha_api',
    event,
    properties,
  });
  posthog.flush();
}

async function POSTHandler(request: NextRequest) {
  try {
    const userAgent = request.headers.get('user-agent') ?? '';
    
    // Collect relevant headers for analysis
    const headers: Record<string, string | undefined> = {};
    const headerNames = [
      'user-agent',
      'accept-language',
      'accept-encoding',
      'accept',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
      'sec-fetch-site',
      'sec-fetch-mode',
      'sec-fetch-dest',
      'referer',
      'origin',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-real-ip',
      'cf-ray',
      'cf-connecting-ip',
      'via',
    ];

    for (const name of headerNames) {
      headers[name] = request.headers.get(name) ?? undefined;
    }

    // Dispatch challenge based on fingerprint analysis
    const challenge = dispatchChallenge({
      headers,
      userAgent,
      rateLimit: false,
    });

    // If not challenging, return minimal response
    if (!challenge.shouldChallenge) {
      trackCaptchaMonitoringEvent('captcha_challenge_request_checked', {
        required: false,
        session_id: challenge.sessionId,
        severity: challenge.severity,
        reason: challenge.reason,
      }, challenge.sessionId);

      return NextResponse.json({
        required: false,
        sessionId: challenge.sessionId,
        message: 'Challenge not required',
      });
    }

    // Return challenge payload
    const requiredResources = challenge.payload && 'requiredResources' in challenge.payload
      ? (challenge.payload as any).requiredResources
      : DEFAULT_CAPTCHA_RESOURCES;

    trackCaptchaMonitoringEvent('captcha_challenge_request_checked', {
      required: true,
      session_id: challenge.sessionId,
      severity: challenge.severity,
      reason: challenge.reason,
      has_js_resource: Boolean(requiredResources.js),
      has_css_resource: Boolean(requiredResources.css),
    }, challenge.sessionId);

    return NextResponse.json({
      required: true,
      sessionId: challenge.sessionId,
      severity: challenge.severity,
      reason: challenge.reason,
      payload: challenge.payload,
      // Client will need to load these resources to prove it's not a bot
      resources: requiredResources,
    });
  } catch (error) {
    captureCaptchaEvent('captcha_challenge_request_error', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json(
      { error: 'Failed to process challenge request' },
      { status: 500 }
    );
  }
}

async function GETHandler(request: NextRequest) {
  // Allow HEAD requests for resource validation
  return POSTHandler(request);
}

export const POST = withAPIObservability(POSTHandler);
export const GET = withAPIObservability(GETHandler);
