/**
 * Challenge dispatcher and tracking system
 * Manages challenge creation, verification, and resource tracking
 */

import { analyzeFingerprint, shouldChallenge, generateChallengePayload } from './captcha-fingerprint';
import type { RequestRiskResult } from './request-risk';

export const DEFAULT_CAPTCHA_RESOURCES = {
  js: '/captcha/client.js',
  css: '/captcha/client.css',
} as const;

export interface ChallengeSession {
  id: string;
  timestamp: number;
  expiresAt: number;
  userAgent: string;
  riskScore: number;
  reasons: string[];
  recommendedAction?: string;
  isChallenged: boolean;
  resourcesLoadTracker: {
    jsLoaded: Set<string>;
    cssLoaded: Set<string>;
  };
  verified: boolean;
}

// In-memory cache for challenge sessions (in production, use Redis/Convex)
const challengeSessions = new Map<string, ChallengeSession>();

// Cleanup old sessions periodically
const globalObj = global as any;
if (typeof global !== 'undefined' && !globalObj.__captcha_cleanup_started) {
  globalObj.__captcha_cleanup_started = true;
  setInterval(() => {
    const now = Date.now();
    const idsToDelete: string[] = [];
    challengeSessions.forEach((session, id) => {
      if (session.expiresAt < now) {
        idsToDelete.push(id);
      }
    });
    idsToDelete.forEach((id) => challengeSessions.delete(id));
  }, 60000); // Cleanup every minute
}

export interface DispatchChallengeOptions {
  headers: Record<string, string | undefined>;
  userAgent: string;
  rateLimit?: boolean;
  hardThreshold?: number;
  softThreshold?: number;
  risk?: RequestRiskResult;
}

/**
 * Analyzes request and decides if challenge should be issued
 */
export function dispatchChallenge(
  options: DispatchChallengeOptions,
): {
  shouldChallenge: boolean;
  sessionId: string;
  payload?: object;
  severity: 'low' | 'medium' | 'high';
  reason: string;
} {
  const { headers, userAgent, rateLimit, hardThreshold, softThreshold, risk } = options;

  // Analyze the fingerprint
  const fingerprint = analyzeFingerprint(userAgent, headers);

  // Determine if challenge is needed
  const decision = risk
    ? {
        shouldChallenge: risk.shouldChallenge,
        reason: risk.reasons.length ? risk.reasons.join(', ') : `Risk score ${risk.riskScore}`,
        severity: risk.severity,
      }
    : shouldChallenge(fingerprint, {
        rateLimit,
        hardThreshold,
        softThreshold,
      });

  // Create or retrieve session
  const sessionId = generateSessionId();
  const session: ChallengeSession = {
    id: sessionId,
    timestamp: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 minute expiry
    userAgent,
    riskScore: risk?.riskScore ?? fingerprint.riskScore,
    reasons: risk?.reasons ?? fingerprint.reasons,
    recommendedAction: risk?.recommendedAction,
    isChallenged: decision.shouldChallenge,
    resourcesLoadTracker: {
      jsLoaded: new Set(),
      cssLoaded: new Set(),
    },
    verified: false,
  };

  challengeSessions.set(sessionId, session);

  if (!decision.shouldChallenge) {
    return {
      shouldChallenge: false,
      sessionId,
      severity: 'low',
      reason: 'No challenge required',
    };
  }

  // Generate challenge payload
  const payload = generateChallengePayload(fingerprint);

  return {
    shouldChallenge: true,
    sessionId,
    payload,
    severity: decision.severity,
    reason: decision.reason,
  };
}

/**
 * Records that a resource (JS/CSS) has been loaded from the client
 */
export function recordResourceLoad(
  sessionId: string,
  resourcePath: string,
  type: 'js' | 'css',
): boolean {
  const session = challengeSessions.get(sessionId);
  if (!session) return false;

  if (type === 'js') {
    session.resourcesLoadTracker.jsLoaded.add(resourcePath);
  } else {
    session.resourcesLoadTracker.cssLoaded.add(resourcePath);
  }

  return true;
}

/**
 * Verifies that the client has loaded the required resources
 */
export function verifyResourceLoads(
  sessionId: string,
  expectedResources: { js: string; css: string } = DEFAULT_CAPTCHA_RESOURCES,
): {
  passed: boolean;
  jsLoaded: boolean;
  cssLoaded: boolean;
  reason: string;
} {
  const session = challengeSessions.get(sessionId);
  if (!session) {
    return { passed: false, jsLoaded: false, cssLoaded: false, reason: 'Session not found' };
  }

  const jsLoaded = session.resourcesLoadTracker.jsLoaded.has(expectedResources.js);
  const cssLoaded = session.resourcesLoadTracker.cssLoaded.has(expectedResources.css);

  if (!jsLoaded || !cssLoaded) {
    return {
      passed: false,
      jsLoaded,
      cssLoaded,
      reason: `Missing resources: ${!jsLoaded ? 'JS' : ''}${!jsLoaded && !cssLoaded ? ', ' : ''}${!cssLoaded ? 'CSS' : ''}`,
    };
  }

  return { passed: true, jsLoaded, cssLoaded, reason: 'All resources loaded' };
}

/**
 * Marks a session as verified after successful CAPTCHA completion
 */
export function markSessionVerified(sessionId: string): boolean {
  const session = challengeSessions.get(sessionId);
  if (!session) return false;

  session.verified = true;
  return true;
}

/**
 * Gets session information (for debugging/monitoring)
 */
export function getSession(sessionId: string): ChallengeSession | undefined {
  return challengeSessions.get(sessionId);
}

/**
 * Cleans up an expired session
 */
export function cleanupSession(sessionId: string): boolean {
  return challengeSessions.delete(sessionId);
}

/**
 * Gets statistics about current challenge sessions
 */
export function getChallengeStats(): {
  totalSessions: number;
  activeSessions: number;
  challengedSessions: number;
  verifiedSessions: number;
  averageRiskScore: number;
} {
  const now = Date.now();
  let activeSessions = 0;
  let challengedSessions = 0;
  let verifiedSessions = 0;
  let totalRiskScore = 0;

  challengeSessions.forEach((session) => {
    if (session.expiresAt > now) {
      activeSessions++;
      totalRiskScore += session.riskScore;

      if (session.isChallenged) {
        challengedSessions++;
      }

      if (session.verified) {
        verifiedSessions++;
      }
    }
  });

  return {
    totalSessions: challengeSessions.size,
    activeSessions,
    challengedSessions,
    verifiedSessions,
    averageRiskScore: activeSessions > 0 ? totalRiskScore / activeSessions : 0,
  };
}

function generateSessionId(): string {
  const crypto = typeof global !== 'undefined' ? global.crypto : (typeof window !== 'undefined' ? window.crypto : undefined);
  if (crypto && 'randomUUID' in crypto) {
    return `session_${crypto.randomUUID()}`;
  }
  if (crypto && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(8);
    (crypto as Crypto).getRandomValues(bytes);
    return `session_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error('Cryptographically secure random number generator not available');
}
