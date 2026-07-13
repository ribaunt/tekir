import { NextResponse } from 'next/server';

/**
 * Everything is open — all users have full access.
 */
async function GETHandler() {
  return NextResponse.json({ hasSubscription: true, message: 'Everything is open.' });
}

export const GET = GETHandler;
