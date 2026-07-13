import { NextResponse } from 'next/server';

/**
 * Everything is open — no subscription refresh needed.
 */
async function POSTHandler() {
  return NextResponse.json({ ok: true, foundActiveSubscription: true, message: 'Everything is open.' });
}

export const POST = POSTHandler;
