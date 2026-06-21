import { createChallenge } from 'ribaunt';
import { NextRequest, NextResponse } from 'next/server';
import { handleAPIError } from '@/lib/api-error-tracking';
import { withAPIObservability } from '@/lib/api-observability';

async function GETHandler(request: NextRequest) {
  try {
    const challenges = createChallenge(5, 8, 120);

    return NextResponse.json({ challenges });
  } catch (error) {
    return handleAPIError(error, request, '/api/captcha/challenge', 'GET', 500);
  }
}

export const GET = withAPIObservability(GETHandler);
