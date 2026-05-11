import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { dispatchChallenge } from '@/lib/captcha-dispatcher';
import { evaluateRequestRisk } from '@/lib/request-risk';
import { formatRiskReasons, trackCaptchaMonitoringEvent } from '@/lib/captcha-monitoring';

const POSTHOG_PROJECT_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

function captureProxyEvent(
  event: string,
  properties: Record<string, string | number | boolean | null | undefined>,
  distinctId = 'proxy'
) {
  if (!POSTHOG_PROJECT_KEY) return;

  const payload = {
    api_key: POSTHOG_PROJECT_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      ...properties,
      server_event: true,
      environment: process.env.NODE_ENV || 'unknown',
    },
  };

  void fetch(`${POSTHOG_HOST}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

const KNOWN_CRAWLER_UA: Array<{ pattern: RegExp; domains: string[] }> = [
  { pattern: /googlebot|google-inspectiontool/i, domains: ['googlebot.com', 'google.com'] },
  { pattern: /bingbot|bingpreview|msnbot/i, domains: ['bingbot.net', 'search.msn.com'] },
  { pattern: /duckduckbot/i, domains: ['duckduckgo.com'] },
  { pattern: /facebookexternalhit|facebot/i, domains: ['facebook.com', 'fb.com'] },
  { pattern: /twitterbot/i, domains: ['twttr.com', 'twitter.com'] },
  { pattern: /slackbot/i, domains: ['slack.com'] },
  { pattern: /discordbot/i, domains: ['discordapp.com', 'discord.com'] },
  { pattern: /linkedinbot/i, domains: ['linkedin.com'] },
  { pattern: /whatsapp/i, domains: ['whatsapp.net'] },
  { pattern: /telegrambot|telegram/i, domains: ['telegram.org'] },
  { pattern: /pinterestbot/i, domains: ['pinterest.com'] },
  { pattern: /applebot/i, domains: ['applebot.apple.com', 'apple.com'] },
];

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  const realIp = request.headers.get('x-real-ip');
  return realIp ?? null;
}

function ipToPtrName(ip: string): string | null {
  if (ip.includes(':')) {
    // IPv6
    const expanded = ip
      .split('::')
      .reduce((acc, part, idx, arr) => {
        if (part) {
          acc.push(...part.split(':'));
        } else {
          const missing = 8 - (arr[0] ? arr[0].split(':').length : 0) - (arr[1] ? arr[1].split(':').length : 0);
          acc.push(...Array(missing).fill('0'));
        }
        return acc;
      }, [] as string[])
      .map((h) => h.padStart(4, '0'))
      .join('');

    const nibbles = expanded.split('').reverse().join('.');
    return `${nibbles}.ip6.arpa`;
  }

  // IPv4
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts.reverse().join('.')}.in-addr.arpa`;
}

async function dnsResolve(name: string, type: 'PTR' | 'A' | 'AAAA'): Promise<string[]> {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];

  const data = (await res.json()) as { Answer?: Array<{ data: string }> };
  return (data.Answer ?? []).map((a) => a.data.replace(/\.$/, ''));
}

async function verifyCrawlerIp(ip: string, domains: string[]): Promise<boolean> {
  const ptrName = ipToPtrName(ip);
  if (!ptrName) return false;

  const hostnames = await dnsResolve(ptrName, 'PTR');
  const matchedHostname = hostnames.find((host) =>
    domains.some((domain) => host.endsWith(domain))
  );

  if (!matchedHostname) return false;

  const [ipv4s, ipv6s] = await Promise.all([
    dnsResolve(matchedHostname, 'A'),
    dnsResolve(matchedHostname, 'AAAA'),
  ]);

  return [...ipv4s, ...ipv6s].includes(ip);
}

async function isVerifiedCrawler(request: NextRequest): Promise<boolean> {
  const ua = request.headers.get('user-agent') ?? '';
  const rule = KNOWN_CRAWLER_UA.find((entry) => entry.pattern.test(ua));
  if (!rule) return false;

  const ip = getClientIp(request);
  if (!ip) return false;

  return verifyCrawlerIp(ip, rule.domains);
}

function collectRiskHeaders(request: NextRequest, userAgent: string): Record<string, string | undefined> {
  return {
    'user-agent': userAgent,
    'accept-language': request.headers.get('accept-language') ?? '',
    'accept-encoding': request.headers.get('accept-encoding') ?? '',
    'accept': request.headers.get('accept') ?? '',
    'sec-ch-ua': request.headers.get('sec-ch-ua') ?? '',
    'sec-ch-ua-mobile': request.headers.get('sec-ch-ua-mobile') ?? '',
    'sec-ch-ua-platform': request.headers.get('sec-ch-ua-platform') ?? '',
    'sec-fetch-site': request.headers.get('sec-fetch-site') ?? '',
    'sec-fetch-mode': request.headers.get('sec-fetch-mode') ?? '',
    'sec-fetch-dest': request.headers.get('sec-fetch-dest') ?? '',
    'referer': request.headers.get('referer') ?? '',
    'origin': request.headers.get('origin') ?? '',
    'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
    'x-forwarded-host': request.headers.get('x-forwarded-host') ?? '',
    'x-real-ip': request.headers.get('x-real-ip') ?? '',
    'cf-ray': request.headers.get('cf-ray') ?? '',
    'cf-connecting-ip': request.headers.get('cf-connecting-ip') ?? '',
    'via': request.headers.get('via') ?? '',
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const allowDebugFlag = process.env.CAPTCHA_DEBUG_FLAG === 'true' || process.env.NODE_ENV !== 'production';
  const captchaDebugFlag = allowDebugFlag && request.nextUrl.searchParams.get('captcha') === 'show';
  captureProxyEvent('proxy_request', {
    pathname,
    captcha_debug: captchaDebugFlag,
  });
  trackCaptchaMonitoringEvent('captcha_proxy_request_checked', {
    pathname,
    method: request.method,
    captcha_debug: captchaDebugFlag,
  });

  // Check if captcha verification is enabled
  const captchaEnabled = process.env.ENABLE_CAPTCHA === 'true';
  const antiAbuseEnabled = process.env.ENABLE_ANTI_ABUSE_CAPTCHA === 'true';
  
  // If captcha is disabled and debug flag is not set, allow all requests through
  if (!captchaEnabled && !captchaDebugFlag) {
    captureProxyEvent('proxy_allow', {
      reason: 'captcha_disabled',
      pathname,
    });
    trackCaptchaMonitoringEvent('captcha_proxy_bypassed', {
      reason: 'captcha_disabled',
      pathname,
      method: request.method,
    });
    return NextResponse.next();
  }

  // Skip middleware for API routes and static files
  if (
    pathname.startsWith('/api/captcha') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/ph/') ||
    pathname.startsWith('/metadata/') ||
    pathname.includes('/favicon.ico') ||
    pathname.includes('/robots.txt') ||
    pathname.includes('/sitemap.xml')
  ) {
    captureProxyEvent('proxy_skip', {
      reason: 'excluded_path',
      pathname,
    });
    trackCaptchaMonitoringEvent('captcha_proxy_bypassed', {
      reason: 'excluded_path',
      pathname,
      method: request.method,
    });
    return NextResponse.next();
  }

  // Allow verified known crawlers and social preview bots to bypass captcha
  if (await isVerifiedCrawler(request)) {
    captureProxyEvent('proxy_allow', {
      reason: 'verified_crawler',
      pathname,
    });
    trackCaptchaMonitoringEvent('captcha_proxy_bypassed', {
      reason: 'verified_crawler',
      pathname,
      method: request.method,
    });
    return NextResponse.next();
  }

  // ========================================================================
  // ANTI-ABUSE CAPTCHA SYSTEM - Automatic Request Analysis
  // ========================================================================
  let antiAbuseInfo = {
    sessionId: null as string | null,
    severity: null as 'low' | 'medium' | 'high' | null,
    riskScore: 0,
    shouldChallenge: false,
    recommendedAction: 'allow',
    routeGroup: 'unknown',
    reasons: [] as string[],
  };

  if (antiAbuseEnabled) {
    const userAgent = request.headers.get('user-agent') ?? '';
    const headers = collectRiskHeaders(request, userAgent);
    const verificationToken = request.cookies.get('__ribaunt_verification_key')?.value;
    const captchaThreshold = parseInt(process.env.CAPTCHA_HARD_THRESHOLD ?? '55', 10);
    const risk = evaluateRequestRisk({
      method: request.method,
      pathname,
      headers,
      userAgent,
      ip: getClientIp(request),
      sessionToken: request.cookies.get('session-token')?.value ?? null,
      deviceId: request.cookies.get('device-id')?.value ?? null,
      hasAuthToken: Boolean(request.cookies.get('auth-token')?.value),
      hasCaptchaToken: Boolean(verificationToken),
      captchaThreshold,
    });

    // Dispatch anti-abuse challenge analysis
    const challenge = dispatchChallenge({
      headers,
      userAgent,
      hardThreshold: captchaThreshold,
      softThreshold: parseInt(process.env.CAPTCHA_SOFT_THRESHOLD ?? '40'),
      risk,
    });

    antiAbuseInfo = {
      sessionId: challenge.sessionId,
      severity: risk.severity,
      riskScore: risk.riskScore,
      shouldChallenge: challenge.shouldChallenge,
      recommendedAction: risk.recommendedAction,
      routeGroup: risk.routeGroup,
      reasons: risk.reasons,
    };

    captureProxyEvent('anti_abuse_analysis', {
      severity: antiAbuseInfo.severity ?? 'low',
      risk_score: antiAbuseInfo.riskScore,
      should_challenge: antiAbuseInfo.shouldChallenge,
      session_id: antiAbuseInfo.sessionId,
      action: antiAbuseInfo.recommendedAction,
      route_group: antiAbuseInfo.routeGroup,
      reason_count: antiAbuseInfo.reasons.length,
    }, antiAbuseInfo.sessionId ?? 'proxy');
    trackCaptchaMonitoringEvent('captcha_risk_evaluated', {
      pathname,
      method: request.method,
      session_id: antiAbuseInfo.sessionId,
      severity: antiAbuseInfo.severity ?? 'low',
      risk_score: antiAbuseInfo.riskScore,
      should_challenge: antiAbuseInfo.shouldChallenge,
      action: antiAbuseInfo.recommendedAction,
      route_group: antiAbuseInfo.routeGroup,
      reason_count: antiAbuseInfo.reasons.length,
      reason_codes: formatRiskReasons(antiAbuseInfo.reasons),
      has_auth_token: Boolean(request.cookies.get('auth-token')?.value),
      has_session_token: Boolean(request.cookies.get('session-token')?.value),
      has_device_id: Boolean(request.cookies.get('device-id')?.value),
      has_captcha_token: Boolean(verificationToken),
    }, antiAbuseInfo.sessionId ?? 'captcha_risk');

    // If high risk detected, log details
    if (challenge.shouldChallenge) {
      captureProxyEvent('anti_abuse_challenge_reason', {
        reason: challenge.reason.slice(0, 500),
        severity: antiAbuseInfo.severity ?? 'unknown',
        session_id: antiAbuseInfo.sessionId,
      }, antiAbuseInfo.sessionId ?? 'proxy');
      trackCaptchaMonitoringEvent('captcha_challenge_required', {
        pathname,
        method: request.method,
        session_id: antiAbuseInfo.sessionId,
        severity: antiAbuseInfo.severity ?? 'unknown',
        risk_score: antiAbuseInfo.riskScore,
        action: antiAbuseInfo.recommendedAction,
        route_group: antiAbuseInfo.routeGroup,
        reason_codes: formatRiskReasons(antiAbuseInfo.reasons),
      }, antiAbuseInfo.sessionId ?? 'captcha_challenge');
    }
  }

  if (captchaDebugFlag) {
    antiAbuseInfo = {
      sessionId: antiAbuseInfo.sessionId ?? `debug_${Date.now()}`,
      severity: 'high',
      riskScore: 99,
      shouldChallenge: true,
      recommendedAction: 'captcha',
      routeGroup: 'debug',
      reasons: ['debug_flag'],
    };

    captureProxyEvent('proxy_debug_challenge', {
      reason: 'debug_flag',
      session_id: antiAbuseInfo.sessionId,
    }, antiAbuseInfo.sessionId ?? 'proxy');
    trackCaptchaMonitoringEvent('captcha_challenge_required', {
      pathname,
      method: request.method,
      session_id: antiAbuseInfo.sessionId,
      severity: 'high',
      risk_score: antiAbuseInfo.riskScore,
      action: antiAbuseInfo.recommendedAction,
      route_group: antiAbuseInfo.routeGroup,
      reason_codes: 'debug_flag',
    }, antiAbuseInfo.sessionId ?? 'captcha_debug');
  }

  // ========================================================================
  // VERIFICATION TOKEN CHECK
  // ========================================================================
  
  // Get the verification cookie
  const verificationToken = request.cookies.get('__ribaunt_verification_key')?.value;

  captureProxyEvent('proxy_token_presence', {
    has_token: !!verificationToken,
    pathname,
  });
  trackCaptchaMonitoringEvent('captcha_token_presence_checked', {
    pathname,
    method: request.method,
    has_token: Boolean(verificationToken),
    session_id: antiAbuseInfo.sessionId,
    risk_score: antiAbuseInfo.riskScore,
  }, antiAbuseInfo.sessionId ?? 'captcha_token');

  // If user has a valid token, allow access only while current behavior stays below the CAPTCHA threshold.
  if (verificationToken && !captchaDebugFlag) {
    try {
      const secret = new TextEncoder().encode(process.env.RIBAUNT_SECRET!);
      if (!process.env.RIBAUNT_SECRET) {
        captureProxyEvent('proxy_config_error', {
          error: 'RIBAUNT_SECRET_missing',
        });
        throw new Error('RIBAUNT_SECRET not configured');
      }
      
      await jwtVerify(verificationToken, secret);
      if (antiAbuseEnabled && antiAbuseInfo.shouldChallenge) {
        captureProxyEvent('proxy_token_valid_but_risky', {
          pathname,
          risk_score: antiAbuseInfo.riskScore,
          severity: antiAbuseInfo.severity ?? 'unknown',
          action: antiAbuseInfo.recommendedAction,
          session_id: antiAbuseInfo.sessionId,
        }, antiAbuseInfo.sessionId ?? 'proxy');
        trackCaptchaMonitoringEvent('captcha_token_rechallenged', {
          pathname,
          method: request.method,
          session_id: antiAbuseInfo.sessionId,
          risk_score: antiAbuseInfo.riskScore,
          severity: antiAbuseInfo.severity ?? 'unknown',
          action: antiAbuseInfo.recommendedAction,
          route_group: antiAbuseInfo.routeGroup,
          reason_codes: formatRiskReasons(antiAbuseInfo.reasons),
        }, antiAbuseInfo.sessionId ?? 'captcha_token');
      } else {
        captureProxyEvent('proxy_allow', {
          reason: 'token_valid',
          pathname,
        });
        trackCaptchaMonitoringEvent('captcha_request_allowed', {
          reason: 'token_valid',
          pathname,
          method: request.method,
          session_id: antiAbuseInfo.sessionId,
          risk_score: antiAbuseInfo.riskScore,
        }, antiAbuseInfo.sessionId ?? 'captcha_allow');
        return NextResponse.next();
      }
    } catch (error) {
      captureProxyEvent('proxy_token_invalid', {
        pathname,
      });
      trackCaptchaMonitoringEvent('captcha_token_invalid', {
        pathname,
        method: request.method,
        session_id: antiAbuseInfo.sessionId,
      }, antiAbuseInfo.sessionId ?? 'captcha_token');
      // Token is invalid or expired, clear it and show captcha
      // Fall through to show captcha page
    }
  }

  // ========================================================================
  // CHALLENGE DECISION
  // ========================================================================

  // If anti-abuse is enabled and the request is low risk, allow through
  if (antiAbuseEnabled && !captchaDebugFlag && !antiAbuseInfo.shouldChallenge) {
    captureProxyEvent('proxy_allow', {
      reason: 'low_risk',
      pathname,
      session_id: antiAbuseInfo.sessionId,
    }, antiAbuseInfo.sessionId ?? 'proxy');
    trackCaptchaMonitoringEvent('captcha_request_allowed', {
      reason: 'low_risk',
      pathname,
      method: request.method,
      session_id: antiAbuseInfo.sessionId,
      risk_score: antiAbuseInfo.riskScore,
      severity: antiAbuseInfo.severity ?? 'low',
      route_group: antiAbuseInfo.routeGroup,
    }, antiAbuseInfo.sessionId ?? 'captcha_allow');
    return NextResponse.next();
  }

  // No token or invalid token - rewrite to captcha page while keeping the URL
  captureProxyEvent('proxy_challenge_redirect', {
    reason: 'no_valid_token',
    pathname,
    session_id: antiAbuseInfo.sessionId,
    severity: antiAbuseInfo.severity ?? 'unknown',
    risk_score: antiAbuseInfo.riskScore,
    action: antiAbuseInfo.recommendedAction,
    route_group: antiAbuseInfo.routeGroup,
  }, antiAbuseInfo.sessionId ?? 'proxy');
  trackCaptchaMonitoringEvent('captcha_ribaunt_page_shown', {
    pathname,
    method: request.method,
    session_id: antiAbuseInfo.sessionId,
    severity: antiAbuseInfo.severity ?? 'unknown',
    risk_score: antiAbuseInfo.riskScore,
    action: antiAbuseInfo.recommendedAction,
    route_group: antiAbuseInfo.routeGroup,
    reason_codes: formatRiskReasons(antiAbuseInfo.reasons),
  }, antiAbuseInfo.sessionId ?? 'captcha_page');
  const url = request.nextUrl.clone();
  url.pathname = '/captcha';
  url.searchParams.set('returnUrl', pathname);
  
  // Add anti-abuse information to URL for CAPTCHA page to display
  if ((antiAbuseEnabled || captchaDebugFlag) && antiAbuseInfo.sessionId) {
    url.searchParams.set('sessionId', antiAbuseInfo.sessionId);
    if (antiAbuseInfo.severity) {
      url.searchParams.set('severity', antiAbuseInfo.severity);
    }
    url.searchParams.set('riskScore', antiAbuseInfo.riskScore.toString());
    
    // Log if this is a high-risk challenge
    if (antiAbuseInfo.severity === 'high') {
      captureProxyEvent('anti_abuse_high_risk', {
        session_id: antiAbuseInfo.sessionId,
        risk_score: antiAbuseInfo.riskScore,
      }, antiAbuseInfo.sessionId ?? 'proxy');
    }
  }
  
  const response = NextResponse.rewrite(url);
  
  // If token was invalid, delete it
  if (verificationToken) {
    response.cookies.delete('__ribaunt_verification_key');
  }
  
  return response;
}

// Simplified matcher - apply to all routes
export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
};

export function middleware(request: NextRequest) {
  return proxy(request);
}
