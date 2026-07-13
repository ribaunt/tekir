import { NextResponse } from 'next/server';

/**
 * Everything is open — no subscription validation needed.
 */
async function POSTHandler() {
  return NextResponse.json({ success: true, message: 'Everything is open.', processed: 0, revoked: 0 });
}

export const POST = POSTHandler;
