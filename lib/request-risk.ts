import { analyzeFingerprint } from '@/lib/captcha-fingerprint';

export type RiskSeverity = 'low' | 'medium' | 'high';
export type RiskAction = 'allow' | 'watch' | 'throttle' | 'resource_proof' | 'captcha' | 'deny';

export interface RequestRiskInput {
  method: string;
  pathname: string;
  headers: Record<string, string | undefined>;
  userAgent: string;
  ip?: string | null;
  sessionToken?: string | null;
  deviceId?: string | null;
  hasAuthToken?: boolean;
  hasCaptchaToken?: boolean;
  captchaThreshold?: number;
}

export interface RequestRiskResult {
  riskScore: number;
  severity: RiskSeverity;
  recommendedAction: RiskAction;
  shouldChallenge: boolean;
  reasons: string[];
  routeGroup: string;
}

type RollingState = {
  firstSeenAt: number;
  lastSeenAt: number;
  sawPage: boolean;
  sawSessionRegister: boolean;
  requestTimes: number[];
  apiTimes: number[];
  highCostTimes: number[];
  authTimes: number[];
  suspiciousTimes: number[];
  routeTimes: Record<string, number[]>;
};

const WINDOW_MS = 60_000;
const STATE_TTL_MS = 30 * 60_000;
const MAX_STATE_SIZE = 5_000;

const states = new Map<string, RollingState>();

function nowMs() {
  return Date.now();
}

function hashValue(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getIpPrefix(ip?: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(':')) {
    return ip.split(':').slice(0, 4).join(':');
  }

  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.slice(0, 3).join('.');
}

function keyFor(label: string, value?: string | null): string | null {
  if (!value) return null;
  return `${label}:${hashValue(value)}`;
}

function getOrCreateState(key: string, now: number): RollingState {
  const existing = states.get(key);
  if (existing) {
    existing.lastSeenAt = now;
    return existing;
  }

  const created: RollingState = {
    firstSeenAt: now,
    lastSeenAt: now,
    sawPage: false,
    sawSessionRegister: false,
    requestTimes: [],
    apiTimes: [],
    highCostTimes: [],
    authTimes: [],
    suspiciousTimes: [],
    routeTimes: {},
  };
  states.set(key, created);
  return created;
}

function pruneList(values: number[], now: number, windowMs = WINDOW_MS): number[] {
  const cutoff = now - windowMs;
  while (values.length && values[0] < cutoff) {
    values.shift();
  }
  return values;
}

function pushRolling(values: number[], now: number): number {
  values.push(now);
  pruneList(values, now);
  return values.length;
}

function cleanup(now: number): void {
  if (states.size < MAX_STATE_SIZE) return;

  for (const [key, state] of states) {
    if (state.lastSeenAt < now - STATE_TTL_MS) {
      states.delete(key);
    }
  }

  if (states.size < MAX_STATE_SIZE) return;

  const overflow = states.size - MAX_STATE_SIZE;
  let removed = 0;
  for (const key of states.keys()) {
    states.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function routeGroup(pathname: string): string {
  if (pathname.startsWith('/api/auth/')) return 'auth';
  if (pathname.startsWith('/api/admin/')) return 'admin';
  if (pathname.startsWith('/api/karakulak/')) return 'ai';
  if (pathname.startsWith('/api/dive')) return 'ai';
  if (pathname.startsWith('/api/recommend')) return 'ai';
  if (pathname.startsWith('/api/pars/')) return 'search';
  if (pathname.startsWith('/api/images/')) return 'search';
  if (pathname.startsWith('/api/news/')) return 'search';
  if (pathname.startsWith('/api/videos/')) return 'search';
  if (pathname.startsWith('/api/autocomplete/')) return 'suggest';
  if (pathname.startsWith('/api/suggest/')) return 'suggest';
  if (pathname.startsWith('/api/session/register')) return 'session_register';
  if (pathname.startsWith('/api/session/')) return 'session';
  if (pathname.startsWith('/api/user/')) return 'account';
  if (pathname.startsWith('/api/polar/') || pathname.startsWith('/api/cheyn/')) return 'billing';
  if (pathname.startsWith('/api/')) return 'api';
  return 'page';
}

function routeBaseRisk(group: string): number {
  switch (group) {
    case 'admin':
      return 25;
    case 'auth':
      return 18;
    case 'ai':
      return 22;
    case 'search':
      return 14;
    case 'account':
    case 'billing':
      return 12;
    case 'suggest':
      return 8;
    case 'api':
      return 6;
    default:
      return 0;
  }
}

function isApiGroup(group: string): boolean {
  return group !== 'page';
}

function isHighCostGroup(group: string): boolean {
  return group === 'ai' || group === 'search';
}

function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function severityFor(score: number): RiskSeverity {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function actionFor(score: number, threshold: number): RiskAction {
  if (score >= 90) return 'deny';
  if (score >= threshold) return 'captcha';
  if (score >= 45) return 'resource_proof';
  if (score >= 35) return 'throttle';
  if (score >= 25) return 'watch';
  return 'allow';
}

export function evaluateRequestRisk(input: RequestRiskInput): RequestRiskResult {
  const now = nowMs();
  cleanup(now);

  const group = routeGroup(input.pathname);
  const reasons: string[] = [];
  let riskScore = routeBaseRisk(group);
  if (riskScore > 0) addReason(reasons, `route:${group}`);

  const fingerprint = analyzeFingerprint(input.userAgent, input.headers);
  if (fingerprint.riskScore > 0) {
    riskScore += fingerprint.riskScore;
    for (const reason of fingerprint.reasons) {
      addReason(reasons, `header:${reason}`);
    }
  }

  const ipPrefix = getIpPrefix(input.ip);
  const keys = [
    keyFor('session', input.sessionToken),
    keyFor('device', input.deviceId),
    keyFor('ip', input.ip),
    keyFor('ip_prefix', ipPrefix),
    input.hasAuthToken ? keyFor('auth_session', input.sessionToken) : null,
  ].filter(Boolean) as string[];

  if (keys.length === 0) {
    riskScore += 10;
    addReason(reasons, 'identity:no_stable_key');
  }

  const primaryKey = keys[0] ?? keyFor('ua', input.userAgent) ?? 'anonymous';
  let maxTotalCount = 0;
  let maxRouteCount = 0;
  let maxApiCount = 0;
  let maxHighCostCount = 0;
  let maxAuthCount = 0;
  let maxSuspiciousCount = 0;
  let apiBeforeSessionRegister = false;
  let apiBeforePage = false;
  let newHighCostRequest = false;

  for (const key of keys.length ? keys : [primaryKey]) {
    const state = getOrCreateState(key, now);
    const routeTimes = state.routeTimes[group] ?? [];
    state.routeTimes[group] = routeTimes;

    const totalCount = pushRolling(state.requestTimes, now);
    const routeCount = pushRolling(routeTimes, now);
    maxTotalCount = Math.max(maxTotalCount, totalCount);
    maxRouteCount = Math.max(maxRouteCount, routeCount);

    if (isApiGroup(group)) {
      const apiCount = pushRolling(state.apiTimes, now);
      maxApiCount = Math.max(maxApiCount, apiCount);
      if (!state.sawSessionRegister && group !== 'session_register' && group !== 'session') {
        apiBeforeSessionRegister = true;
      }
      if (!state.sawPage && group !== 'session_register' && group !== 'session') {
        apiBeforePage = true;
      }
    } else {
      state.sawPage = true;
    }

    if (group === 'session_register') {
      state.sawSessionRegister = true;
    }

    if (isHighCostGroup(group)) {
      const highCostCount = pushRolling(state.highCostTimes, now);
      maxHighCostCount = Math.max(maxHighCostCount, highCostCount);
      const sessionAgeMs = now - state.firstSeenAt;
      if (sessionAgeMs < 10_000) {
        newHighCostRequest = true;
      }
      if (!input.sessionToken) {
        addReason(reasons, 'identity:high_cost_without_session');
      }
    }

    if (group === 'auth') {
      const authCount = pushRolling(state.authTimes, now);
      maxAuthCount = Math.max(maxAuthCount, authCount);
    }

    if (group === 'admin' && !input.hasAuthToken) {
      const suspiciousCount = pushRolling(state.suspiciousTimes, now);
      maxSuspiciousCount = Math.max(maxSuspiciousCount, suspiciousCount);
    }
  }

  if (apiBeforeSessionRegister) {
    riskScore += 10;
    addReason(reasons, 'sequence:api_before_session_register');
  }

  if (apiBeforePage) {
    riskScore += 12;
    addReason(reasons, 'sequence:api_before_page');
  }

  if (newHighCostRequest) {
    riskScore += 15;
    addReason(reasons, 'session:new_high_cost_request');
  }

  if (isHighCostGroup(group) && !input.sessionToken) {
    riskScore += 10;
  }

  if (maxApiCount > 20) {
    riskScore += 20;
    addReason(reasons, 'velocity:api_burst');
  } else if (maxApiCount > 10) {
    riskScore += 10;
    addReason(reasons, 'velocity:api_warm');
  }

  if (maxHighCostCount > 8) {
    riskScore += 30;
    addReason(reasons, 'velocity:high_cost_burst');
  } else if (maxHighCostCount > 4) {
    riskScore += 18;
    addReason(reasons, 'velocity:high_cost_warm');
  }

  if (maxAuthCount > 8) {
    riskScore += 28;
    addReason(reasons, 'failure_cluster:auth_attempt_burst');
  } else if (maxAuthCount > 4) {
    riskScore += 14;
    addReason(reasons, 'failure_cluster:auth_attempt_warm');
  }

  if (group === 'admin' && !input.hasAuthToken) {
    riskScore += 22;
    addReason(reasons, 'auth:admin_without_auth_cookie');
    if (maxSuspiciousCount > 3) {
      riskScore += 20;
      addReason(reasons, 'failure_cluster:admin_probe_burst');
    }
  }

  if (maxTotalCount > 80) {
    riskScore += 30;
    addReason(reasons, 'velocity:request_flood');
  } else if (maxTotalCount > 40) {
    riskScore += 15;
    addReason(reasons, 'velocity:request_spike');
  }

  if (maxRouteCount > 20) {
    riskScore += 20;
    addReason(reasons, `velocity:${group}_route_burst`);
  } else if (maxRouteCount > 10) {
    riskScore += 10;
    addReason(reasons, `velocity:${group}_route_warm`);
  }

  const fetchSite = input.headers['sec-fetch-site'];
  const fetchMode = input.headers['sec-fetch-mode'];
  const origin = input.headers.origin;
  if (isApiGroup(group) && input.method !== 'GET') {
    if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
      riskScore += 25;
      addReason(reasons, 'fetch_metadata:cross_site_mutation');
    }
    if (!fetchSite && input.userAgent.includes('Mozilla')) {
      riskScore += 8;
      addReason(reasons, 'fetch_metadata:missing_on_mutation');
    }
    if (origin && !origin.includes('tekir.co') && !origin.includes('localhost')) {
      riskScore += 20;
      addReason(reasons, 'origin:unexpected_mutation_origin');
    }
  }

  if (group === 'page' && fetchMode === 'navigate') {
    riskScore = Math.max(0, riskScore - 8);
  }

  if (input.hasCaptchaToken) {
    riskScore = Math.max(0, riskScore - 25);
    addReason(reasons, 'captcha:verified_token_present');
  }

  const threshold = input.captchaThreshold ?? 55;
  riskScore = Math.min(100, Math.max(0, riskScore));
  const recommendedAction = actionFor(riskScore, threshold);

  return {
    riskScore,
    severity: severityFor(riskScore),
    recommendedAction,
    shouldChallenge: riskScore >= threshold,
    reasons,
    routeGroup: group,
  };
}
