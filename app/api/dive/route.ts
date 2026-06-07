import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-middleware';
import { load } from 'cheerio';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import {
  trackServerAIError,
  flushServerEvents,
  trackLLMGeneration,
} from '@/lib/analytics-server';
import { WideEvent } from '@/lib/wide-event';
import { withAPIObservability } from '@/lib/api-observability';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://tekir.co',
    'X-Title': 'Tekir',
  },
});

const DIVE_MODEL = 'openai/gpt-5-mini';
const DIVE_PROVIDER = 'openai';
const MAX_DIVE_ANSWER_CHARS = 420;
const DIVE_MAX_COMPLETION_TOKENS = 700;
const DIVE_GENERATION_CONFIG = {
  max_completion_tokens: DIVE_MAX_COMPLETION_TOKENS,
  reasoning_effort: 'low' as const,
  reasoning: {
    exclude: true,
  },
};

function toPlainShortAnswer(value: string, maxChars = MAX_DIVE_ANSWER_CHARS): string {
  const plain = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxChars) {
    return plain;
  }

  const clipped = plain.slice(0, maxChars + 1).trim();
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('.'),
    clipped.lastIndexOf('!'),
    clipped.lastIndexOf('?')
  );

  if (sentenceEnd >= Math.min(140, maxChars * 0.45)) {
    return clipped.slice(0, sentenceEnd + 1).trim();
  }

  const lastSpace = clipped.lastIndexOf(' ', maxChars - 1);
  const cutAt = lastSpace > 90 ? lastSpace : maxChars;
  return `${clipped.slice(0, cutAt).trim()}...`;
}

interface PageContent {
  url: string;
  title: string;
  snippet?: string;
  htmlContent?: string;
}

async function fetchPageContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const $ = load(html);

    $('script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar').remove();

    let mainContent = '';

    const selectors = [
      'article',
      '[role="main"]',
      '.content',
      '.post-content',
      '.entry-content',
      'main',
      '.main-content'
    ];

    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        mainContent = element.text();
        break;
      }
    }

    if (!mainContent) {
      mainContent = $('body').text();
    }

    mainContent = mainContent
      .replace(/\n{2,}/g, '\n')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return mainContent.substring(0, 2000);
  } catch (error) {
    return "";
  }
}

async function fetchPagesWithFallback(pages: PageContent[]): Promise<PageContent[]> {
  const TARGET_PAGES = 2;
  const MAX_CONCURRENT = 4;

  const firstBatch = pages.slice(0, MAX_CONCURRENT);
  const fetchPromises = firstBatch.map(async (page) => {
    const content = await fetchPageContent(page.url);

    if (content && content.trim().length > 100) {
      return {
        ...page,
        htmlContent: content,
      };
    } else {
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);
  const validResults = results.filter(result => result !== null) as PageContent[];

  if (validResults.length >= TARGET_PAGES) {
    return validResults.slice(0, TARGET_PAGES);
  }

  if (validResults.length < TARGET_PAGES && pages.length > MAX_CONCURRENT) {
    const needed = TARGET_PAGES - validResults.length;
    const remainingPages = pages.slice(MAX_CONCURRENT);
    const remainingPromises = remainingPages.slice(0, needed * 2).map(async (page) => {
      const content = await fetchPageContent(page.url);

      if (content && content.trim().length > 100) {
        return {
          ...page,
          htmlContent: content,
        };
      } else {
        return null;
      }
    });

    const remainingResults = await Promise.all(remainingPromises);
    const validRemainingResults = remainingResults.filter(result => result !== null) as PageContent[];

    validResults.push(...validRemainingResults.slice(0, needed));
  }

  return validResults;
}

async function POSTHandler(req: NextRequest) {
  // Generate unique trace ID for this request
  const traceId = randomUUID();
  const generationSpanId = randomUUID();
  const startTime = Date.now();
  let llmPromptForAnalytics = '';

  // Initialize wide event
  const wideEvent = WideEvent.getOrCreate();
  wideEvent.setRequest({ method: 'POST', path: '/api/dive' });
  wideEvent.setCustom('trace_id', traceId);

  const rateLimitResult = await checkRateLimit(req, '/api/dive');
  if (!rateLimitResult.success) {
    wideEvent.setError({ type: 'RateLimitError', message: 'Rate limit exceeded', code: 'rate_limited' });
    wideEvent.finish(429);
    return rateLimitResult.response!;
  }

  try {
    const { query, pages } = await req.json() as { query: string, pages: PageContent[] };

    if (!query || !pages || pages.length === 0) {
      wideEvent.setError({ type: 'ValidationError', message: 'Missing query or pages', code: 'invalid_input' });
      wideEvent.finish(400);
      return NextResponse.json({ error: 'Missing query or pages for Dive mode.' }, { status: 400 });
    }

    wideEvent.setCustom('query_length', query.length);
    wideEvent.setCustom('candidate_pages', pages.length);

    // Fetch pages
    const fetchStartTime = Date.now();
    const validPages = await fetchPagesWithFallback(pages);
    const fetchDuration = Date.now() - fetchStartTime;

    if (validPages.length === 0) {
      wideEvent.setError({ type: 'FetchError', message: 'Could not fetch any pages', code: 'fetch_failed' });
      wideEvent.finish(500);
      return NextResponse.json({ error: 'Could not fetch meaningful content from any of the provided URLs.' }, { status: 500 });
    }

    wideEvent.setCustom('pages_fetched', validPages.length);
    wideEvent.setCustom('fetch_duration_ms', fetchDuration);

    // Prepare prompt for LLM
    let contextForLlm = "";
    validPages.forEach((page, index) => {
      const truncatedContent = page.htmlContent ? page.htmlContent.substring(0, 1000) : '';
      contextForLlm += `Source ${index + 1}: ${truncatedContent}\n\n`;
    });

    const llmPrompt = `Query: "${query}"\n\nContent:\n${contextForLlm}\n\nProvide a concise, accurate answer based on the above sources. Use raw plain text only, one short paragraph, 1 to 3 sentences, maximum ${MAX_DIVE_ANSWER_CHARS} characters. Do not use Markdown, headings, bullets, numbered lists, tables, code blocks, quotes, bold, italic, emojis, or decorative/text-styling syntax. Finish the thought inside the character limit and do not trail off mid-sentence.`;
    llmPromptForAnalytics = llmPrompt;

    // Call LLM with timing
    const aiStartTime = Date.now();
    const llmResponse = await openai.chat.completions.create({
      model: DIVE_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant for Tekir Dive mode. Provide concise, accurate answers based on web sources. Be direct and helpful. Return raw plain text only. Never use Markdown, headings, bullets, numbered lists, tables, code blocks, quotes, bold, italic, emojis, or decorative/text-styling syntax. Keep the answer to one short paragraph, 1 to 3 sentences, maximum ${MAX_DIVE_ANSWER_CHARS} characters. Finish the thought inside the character limit and do not offer to answer a second question.`,
        },
        {
          role: 'user',
          content: llmPrompt,
        },
      ],
      ...DIVE_GENERATION_CONFIG,
    });

    const aiDuration = Date.now() - aiStartTime;
    const totalDuration = Date.now() - startTime;

    const answer = toPlainShortAnswer(llmResponse.choices[0].message.content ?? '');
    const actualModel = llmResponse.model || DIVE_MODEL;
    const usage = llmResponse.usage;

    // Update wide event with AI context
    wideEvent.setAI({
      model: 'dive',
      query_length: query.length,
      response_length: answer.length,
      estimated_tokens: usage?.total_tokens,
      is_dive_mode: true,
      providers_used: [DIVE_PROVIDER],
      sources_count: validPages.length,
    });
    wideEvent.setCustom('ai_duration_ms', aiDuration);
    wideEvent.setCustom('actual_model', actualModel);
    wideEvent.finish(200);

    // Track with native PostHog LLM analytics
    trackLLMGeneration({
      $ai_provider: DIVE_PROVIDER,
      $ai_model: actualModel,
      $ai_input: llmPrompt,
      $ai_output: answer,
      $ai_latency: aiDuration,
      $ai_tokens_input: usage?.prompt_tokens,
      $ai_tokens_output: usage?.completion_tokens,
      $ai_tokens_total: usage?.total_tokens,
      $ai_trace_id: traceId,
      $ai_span_id: generationSpanId,
      $ai_span_name: 'dive_generation',
      $ai_max_tokens: DIVE_MAX_COMPLETION_TOKENS,
      $ai_http_status: 200,
      $ai_base_url: 'https://openrouter.ai/api/v1',
      $ai_request_url: 'https://openrouter.ai/api/v1/chat/completions',
      $ai_stop_reason: llmResponse.choices[0]?.finish_reason || undefined,
    });

    const jsonResponse = NextResponse.json({
      response: answer || "The AI could not generate a response based on the provided content.",
      sources: validPages.map(p => ({ url: p.url, title: p.title, description: p.snippet })),
      metadata: {
        totalDuration,
        fetchDuration,
        aiDuration,
        pagesAttempted: pages.length,
        pagesSuccessful: validPages.length,
        trace_id: traceId,
      }
    });

    // Flush analytics events
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));

    return jsonResponse;

  } catch (error: any) {
    const totalDuration = Date.now() - startTime;

    wideEvent.setError({
      type: error.name || 'DiveError',
      message: error.message || 'Dive request failed',
      code: 'dive_error',
      domain: 'upstream_api',
    });
    wideEvent.finish(500);

    trackServerAIError({
      model: 'dive',
      error_type: error.name || 'DiveError',
      is_dive_mode: true,
    });
    trackLLMGeneration({
      $ai_provider: DIVE_PROVIDER,
      $ai_model: DIVE_MODEL,
      $ai_input: llmPromptForAnalytics,
      $ai_output: '',
      $ai_latency: totalDuration,
      $ai_trace_id: traceId,
      $ai_span_id: generationSpanId,
      $ai_span_name: 'dive_generation',
      $ai_max_tokens: DIVE_MAX_COMPLETION_TOKENS,
      $ai_http_status: error.status || error.statusCode || 500,
      $ai_base_url: 'https://openrouter.ai/api/v1',
      $ai_request_url: 'https://openrouter.ai/api/v1/chat/completions',
      $ai_is_error: true,
      $ai_error: error.message || 'Dive request failed',
    });
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));

    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export const POST = withAPIObservability(POSTHandler);
