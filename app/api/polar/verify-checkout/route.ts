import { NextResponse } from 'next/server';

/**
 * Everything is open — no checkout verification needed.
 */
async function POSTHandler() {
  return NextResponse.json({ success: true, message: 'Everything is open.' });
}

export const POST = POSTHandler;
