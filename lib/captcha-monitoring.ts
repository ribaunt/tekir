const POSTHOG_PROJECT_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

export type CaptchaMonitoringProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

function truncate(value: string, maxLength = 500): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeProperties(properties: CaptchaMonitoringProperties): CaptchaMonitoringProperties {
  const normalized: CaptchaMonitoringProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string') {
      normalized[key] = truncate(value);
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function toCaptchaMonitoringProperties(
  properties: Record<string, unknown>,
): CaptchaMonitoringProperties {
  const safe: CaptchaMonitoringProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      safe[key] = value;
    } else if (value instanceof Error) {
      safe[key] = value.message;
    } else {
      safe[key] = String(value);
    }
  }

  return safe;
}

export function trackCaptchaMonitoringEvent(
  event: string,
  properties: CaptchaMonitoringProperties = {},
  distinctId = 'captcha_monitoring',
): void {
  if (!POSTHOG_PROJECT_KEY) return;

  const payload = {
    api_key: POSTHOG_PROJECT_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      ...normalizeProperties(properties),
      source: 'captcha_monitoring',
      server_event: true,
      privacy_scope: 'no_raw_ip_no_payload',
      environment: process.env.NODE_ENV || 'unknown',
    },
  };

  void fetch(`${POSTHOG_HOST}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function formatRiskReasons(reasons: string[] | undefined): string {
  if (!reasons?.length) return '';
  return truncate(reasons.slice(0, 12).join('|'), 500);
}
