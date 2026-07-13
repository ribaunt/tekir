/**
 * API Route Wrapper with Wide Event Logging
 *
 * Wraps Next.js API route handlers with automatic wide-event logging.
 * Captures request context, timing, errors, and automatically emits
 * a canonical log line at the end of each request.
 *
 * Usage:
 * ```ts
 * import { withWideEvent } from '@/lib/api-wrapper';
 *
 * export const GET = withWideEvent(async (req, ctx) => {
 *   const { wideEvent, user } = ctx;
 *   wideEvent.setUser(user);
 *   // ... your handler logic
 *   return Response.json({ data });
 * });
 * ```
 */

import { headers, cookies } from 'next/headers';
import type { UserContext } from './wide-event';
import { WideEvent, resetWideEvent } from './wide-event';
import { logger } from './opentelemetry-logger';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface WideEventContext {
  wideEvent: WideEvent;
  requestId: string;
  userId?: string;
  user?: any;
}

export type WrappedHandler<T = any> = (
  req: Request,
  ctx: WideEventContext
) => Promise<Response> | Response;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract user from session token
 */
async function getUserFromSession(): Promise<{ id?: string; subscription?: string; [key: string]: any } | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session-token')?.value;

    if (!sessionToken) {
      return null;
    }

    // Import Convex dynamically to avoid edge runtime issues
    const { getConvexClient } = await import('@/lib/convex-client');
    const { api } = await import('@/convex/_generated/api');
    const convex = getConvexClient();

    const session = await convex.query(api.sessions.getSessionByToken, { token: sessionToken });

    if (!session || !session.userId) {
      return null;
    }

    const user = await convex.query(api.users.getUserById, { id: session.userId });

    if (!user) {
      return null;
    }

    return {
      id: user._id,
      username: user.username,
      email: user.email,
      subscription: 'plus' as const,
      createdAt: user.createdAt,
    };
  } catch (error) {
    // If session validation fails, continue without user context
    if (process.env.NODE_ENV === 'development') {
      console.error('[API Wrapper] Failed to get user from session:', error);
    }
    return null;
  }
}

/**
 * Parse request URL for method and path
 */
function parseRequest(req: Request): { method: string; path: string; query?: Record<string, string> } {
  const url = new URL(req.url);
  const path = url.pathname;
  const query: Record<string, string> = {};

  url.searchParams.forEach((value, key) => {
    // Sanitize query params - only include safe ones
    if (['q', 'query', 'type', 'provider', 'page', 'limit', 'tab', 'model'].includes(key)) {
      query[key] = value;
    }
  });

  return { method: req.method, path, query };
}

/**
 * Extract error information from an error object
 */
function extractErrorInfo(error: unknown): { type: string; message: string; code?: string; retriable?: boolean } {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      retriable: false,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as any;
    return {
      type: err.name || err.type || 'Error',
      message: err.message || err.error || String(error),
      code: err.code,
      retriable: err.retriable || false,
    };
  }

  return {
    type: 'Error',
    message: String(error),
  };
}

// ============================================================================
// Middleware Wrapper
// ============================================================================

/**
 * Wrap an API route handler with wide event logging
 */
export function withWideEvent<T = any>(
  handler: WrappedHandler<T>,
  options?: {
    logBody?: boolean;
    extractUser?: boolean;
  }
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const startTime = Date.now();
    const requestId = randomUUID();

    // Reset any previous wide event (shouldn't happen, but safety first)
    resetWideEvent();

    // Create new wide event for this request
    const wideEvent = WideEvent.getOrCreate();

    // Parse request
    const { method, path, query } = parseRequest(req);

    // Set initial request context
    wideEvent.setRequest({ method, path, query });

    // Set request ID
    wideEvent.setCustom('request_id', requestId);

    // Get user if option is enabled (default: true)
    let userData: any = null;
    if (options?.extractUser !== false) {
      try {
        userData = await getUserFromSession();
        if (userData) {
          const user: UserContext = {
            id: userData.id,
            username: userData.username,
            subscription: userData.subscription as any,
          };

          // Calculate account age if we have createdAt
          if (userData.createdAt) {
            const ageDays = Math.floor((Date.now() - new Date(userData.createdAt).getTime()) / (1000 * 60 * 60 * 24));
            user.account_age_days = ageDays;
          }

          wideEvent.setUser(user);
        }
      } catch {
        // Continue without user context
      }
    }

    // Build context object
    const ctx: WideEventContext = {
      wideEvent,
      requestId,
      userId: userData?.id,
      user: userData,
    };

    try {
      // Call the actual handler
      const response = await handler(req, ctx);

      // Extract status code from Response
      const statusCode = response instanceof Response ? response.status : 200;

      // Finish the wide event with success status
      wideEvent.finish(statusCode);

      return response;
    } catch (error) {
      // Extract error info
      const errorInfo = extractErrorInfo(error);

      // Set error on wide event
      wideEvent.setError(errorInfo);

      // Finish with error status
      wideEvent.finish(500);

      // Also log to OpenTelemetry logger for immediate visibility
      logger.error(`${method} ${path} - ${errorInfo.type}: ${errorInfo.message}`, {
        request_id: requestId,
        status_code: 500,
        duration_ms: Date.now() - startTime,
        error_type: errorInfo.type,
        error_message: errorInfo.message,
        user_id: userData?.id,
      });

      // Return error response
      return Response.json(
        { error: errorInfo.message || 'Internal server error' },
        { status: 500 }
      );
    } finally {
      // Clean up
      resetWideEvent();
    }
  };
}

// ============================================================================
// Convenience Wrappers for Common Patterns
// ============================================================================

/**
 * Wrap a public API route (no authentication required)
 */
export function withPublicAPI<T = any>(
  handler: WrappedHandler<T>
): (req: Request) => Promise<Response> {
  return withWideEvent(handler, { extractUser: false });
}

/**
 * Wrap an authenticated API route
 */
export function withAuthAPI<T = any>(
  handler: WrappedHandler<T>
): (req: Request) => Promise<Response> {
  return withWideEvent(handler, { extractUser: true });
}

/**
 * Wrap an admin API route (requires admin user)
 */
export function withAdminAPI<T = any>(
  handler: WrappedHandler<T>
): (req: Request) => Promise<Response> {
  return withWideEvent(async (req, ctx) => {
    // Check if user is admin
    if (!ctx.user || ctx.user.role !== 'admin') {
      ctx.wideEvent.setError({ type: 'Unauthorized', message: 'Admin access required' });
      ctx.wideEvent.finish(403);
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    return handler(req, ctx);
  }, { extractUser: true });
}

// ============================================================================
// Direct Export
// ============================================================================

export default withWideEvent;
