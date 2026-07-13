import { NextResponse } from 'next/server';

/**
 * Everything is open — no customer portal needed.
 */
async function POSTHandler() {
  return NextResponse.json({ success: true, message: 'Everything is open.' });
}

export const POST = POSTHandler;
