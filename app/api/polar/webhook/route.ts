import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Polar.sh webhook handler
 * 
 * Everything is open — no subscription processing needed.
 * Webhooks are acknowledged but not acted upon.
 */
async function POSTHandler(_req: NextRequest) {
  return NextResponse.json({ received: true });
}

export const POST = POSTHandler;
