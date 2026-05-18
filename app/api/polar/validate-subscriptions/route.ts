import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSubscriptions } from '@/lib/polar';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { handleAPIError } from '@/lib/api-error-tracking';
import { captureServerEvent, type ServerEventProperties } from '@/lib/analytics-server';
import { withAPIObservability } from '@/lib/api-observability';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Internal API endpoint to validate Plus subscriptions
 * Called daily by a Convex cron job to ensure subscription status is in sync
 * 
 * This endpoint:
 * 1. Fetches all users with the 'paid' role
 * 2. For each user, checks their Polar subscription status
 * 3. Removes the 'paid' role if subscription is no longer active
 * 
 * POST /api/polar/validate-subscriptions
 * 
 * Headers:
 * - X-Convex-Cron-Secret: Secret key to authenticate cron requests
 */
async function POSTHandler(req: NextRequest) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  };

  const logPolarEvent = (
    event: string,
    properties?: ServerEventProperties,
    distinctId?: string
  ) => {
    captureServerEvent(`polar_validate_subscriptions_${event}`, {
      endpoint: '/api/polar/validate-subscriptions',
      ...properties,
    }, distinctId);
  };

  try {
    // Verify the request is from our Convex cron job
    const cronSecret = req.headers.get('X-Convex-Cron-Secret');
    const expectedSecret = process.env.CONVEX_CRON_SECRET;

    if (!expectedSecret || cronSecret !== expectedSecret) {
      console.error('[Polar Validation] Invalid or missing cron secret');
      return handleAPIError(
        new Error('Invalid or missing cron secret'),
        req,
        '/api/polar/validate-subscriptions',
        'POST',
        401
      );
    }

    logPolarEvent('start');

    // Get all users with 'paid' role
    const paidUsers = await convex.query(api.users.listPaidUsers, {});

    if (!paidUsers || paidUsers.length === 0) {
      logPolarEvent('no_paid_users');
      return NextResponse.json(
        { 
          success: true, 
          message: 'No paid users to validate',
          processed: 0,
          revoked: 0,
        },
        { headers }
      );
    }

    logPolarEvent('paid_users_found', { paid_users_count: paidUsers.length });

    let processed = 0;
    let revoked = 0;
    const errors: string[] = [];

    for (const user of paidUsers) {
      processed++;

      if (typeof user.cheynPlusExpiresAt === 'number' && user.cheynPlusExpiresAt > Date.now()) {
        logPolarEvent('active_cheyn_prepaid_access', {}, user._id);
        continue;
      }
      
      if (!user.polarCustomerId) {
        if (typeof user.cheynPlusExpiresAt === 'number' && user.cheynPlusExpiresAt <= Date.now()) {
          logPolarEvent('expired_cheyn_prepaid_access', {}, user._id);

          const currentRoles = user.roles || [];
          const newRoles = currentRoles.filter(
            (r: string) => r.toLowerCase() !== 'paid'
          );

          if (newRoles.length !== currentRoles.length) {
            await convex.mutation(api.users.updateUserRoles, {
              id: user._id as Id<'users'>,
              roles: newRoles,
              cronSecret: cronSecret ?? undefined,
            });

            revoked++;
            logPolarEvent('revoked_expired_cheyn_paid_role', {}, user._id);
          }
          continue;
        }

        // Skip users without a Polar customer ID - they might have been granted access manually.
        logPolarEvent('missing_polar_customer_id', {}, user._id);
        continue;
      }

      try {
        // Check subscription status with Polar
        const result = await getCustomerSubscriptions(user.polarCustomerId);

        if (!result.success) {
          console.error(`[Polar Validation] Failed to fetch subscriptions for user ${user._id}: API error`);
          errors.push(`User ${user._id}: API error`);
          continue;
        }

        const hasActiveSubscription = result.subscriptions.length > 0;

        if (!hasActiveSubscription) {
          logPolarEvent('no_active_subscription', {}, user._id);
          
          // Revoke the paid role
          const currentRoles = user.roles || [];
          const newRoles = currentRoles.filter(
            (r: string) => r.toLowerCase() !== 'paid'
          );

          if (newRoles.length !== currentRoles.length) {
            await convex.mutation(api.users.updateUserRoles, {
              id: user._id as Id<'users'>,
              roles: newRoles,
              cronSecret: cronSecret ?? undefined,
            });
            
            revoked++;
            logPolarEvent('revoked_paid_role', {}, user._id);
          }
        } else {
          logPolarEvent('active_subscription', {
            subscription_status: result.subscriptions[0].status,
          }, user._id);
        }
      } catch (error) {
        console.error(`[Polar Validation] Error processing user ${user._id}:`, error);
        errors.push(`User ${user._id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Add small delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logPolarEvent('complete', {
      processed,
      revoked,
      errors_count: errors.length,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Subscription validation complete',
        processed,
        revoked,
        errors: errors.length > 0 ? errors : undefined,
      },
      { headers }
    );
  } catch (error) {
    console.error('[Polar Validation] Fatal error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers }
    );
  }
}

export const POST = withAPIObservability(POSTHandler);
