import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-middleware';
import OpenAI from 'openai';
import { WideEvent } from '@/lib/wide-event';
import { flushServerEvents, trackLLMGeneration } from '@/lib/analytics-server';
import { handleAPIError } from '@/lib/api-error-tracking';
import { randomUUID } from 'crypto';
import { withAPIObservability } from '@/lib/api-observability';

// Country code to language code mapping for Wikipedia
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  'AR': 'es',
  'AU': 'en',
  'AT': 'de',
  'BE': 'nl',
  'BR': 'pt',
  'CA': 'en',
  'CL': 'es',
  'DK': 'da',
  'FI': 'fi',
  'FR': 'fr',
  'DE': 'de',
  'HK': 'zh',
  'IN': 'en',
  'ID': 'id',
  'IT': 'it',
  'JP': 'ja',
  'KR': 'ko',
  'MY': 'en',
  'MX': 'es',
  'NL': 'nl',
  'NZ': 'en',
  'NO': 'no',
  'CN': 'zh',
  'PL': 'pl',
  'PT': 'pt',
  'PH': 'en',
  'RU': 'ru',
  'SA': 'ar',
  'ZA': 'en',
  'ES': 'es',
  'SE': 'sv',
  'CH': 'de',
  'TW': 'zh',
  'TR': 'tr',
  'GB': 'en',
  'US': 'en',
  'ALL': 'en'
};

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://tekir.co',
    'X-Title': 'Tekir Search',
  },
});

const WIKIPEDIA_SUGGEST_MODEL = process.env.WIKIPEDIA_SUGGEST_MODEL || 'mistralai/mistral-small-3.2-24b-instruct';

async function suggestWikipediaArticle(
  query: string, 
  browserLanguage?: string, 
  searchCountry?: string,
  traceId?: string
): Promise<{ article: string; language: string }> {
  let priorityLanguage = browserLanguage;
  
  if (!priorityLanguage && searchCountry && COUNTRY_TO_LANGUAGE[searchCountry]) {
    priorityLanguage = COUNTRY_TO_LANGUAGE[searchCountry];
  }

  try {
    if (priorityLanguage) {
      const spanId = randomUUID();
      const prompt = `Suggest the best matching Wikipedia article for query "${query}" in ${priorityLanguage}.`;
      const aiStart = Date.now();
      const response = await openai.chat.completions.create({
        model: WIKIPEDIA_SUGGEST_MODEL,
        temperature: 0.1, 
        max_tokens: 80,
        messages: [
          {
            role: 'system',
            content: `You are a helpful search assistant. The user will provide you with a search query, and you should respond with the best matching Wikipedia article name in ${priorityLanguage} language. Respond in this exact format: ARTICLE_NAME|${priorityLanguage} (without quotes). Try to find the article in ${priorityLanguage} language first. If no suitable article exists in ${priorityLanguage}, fall back to English.`
          },
          {
            role: 'user',
            content: query,
          },
        ],
        stream: false,
      });
      const aiLatency = Date.now() - aiStart;

      const result = response.choices[0].message.content?.trim() || '';
      trackLLMGeneration({
        $ai_provider: 'openrouter',
        $ai_model: response.model || WIKIPEDIA_SUGGEST_MODEL,
        $ai_input: prompt,
        $ai_output: result,
        $ai_latency: aiLatency,
        $ai_tokens_input: response.usage?.prompt_tokens,
        $ai_tokens_output: response.usage?.completion_tokens,
        $ai_tokens_total: response.usage?.total_tokens,
        $ai_trace_id: traceId,
        $ai_span_id: spanId,
        $ai_span_name: 'wikipedia_priority_language_suggest',
        $ai_temperature: 0.1,
        $ai_max_tokens: 80,
        $ai_http_status: 200,
        $ai_base_url: 'https://openrouter.ai/api/v1',
        $ai_request_url: 'https://openrouter.ai/api/v1/chat/completions',
        $ai_stop_reason: response.choices[0]?.finish_reason || undefined,
      });
      
      const parts = result.split('|');
      if (parts.length === 2) {
        const article = parts[0].trim().replace(/^["']|["']$/g, '');
        const language = parts[1].trim().replace(/^["']|["']$/g, '').toLowerCase();
        
        if (article && language) {
          return { article, language };
        }
      }
    }
    
    // Priority 3: AI-based query language detection (fallback)
    const spanId = randomUUID();
    const prompt = `Detect the query language and suggest the best matching Wikipedia article for query "${query}".`;
    const aiStart = Date.now();
    const response = await openai.chat.completions.create({
      model: WIKIPEDIA_SUGGEST_MODEL,
      temperature: 0.1, 
      max_tokens: 80,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful search assistant. The user will provide you with a search query, and you should respond with the best matching Wikipedia article name and the appropriate language code. Detect the language of the query and suggest the article from the corresponding Wikipedia. Respond in this exact format: ARTICLE_NAME|LANGUAGE_CODE (without quotes). Examples: "Artificial Intelligence|en" for English, "Türkiye|tr" for Turkish, "Deutschland|de" for German. Use 2-letter ISO language codes.'
        },
        {
          role: 'user',
          content: query,
        },
      ],
      stream: false,
    });
    const aiLatency = Date.now() - aiStart;

    const result = response.choices[0].message.content?.trim() || '';
    trackLLMGeneration({
      $ai_provider: 'openrouter',
      $ai_model: response.model || WIKIPEDIA_SUGGEST_MODEL,
      $ai_input: prompt,
      $ai_output: result,
      $ai_latency: aiLatency,
      $ai_tokens_input: response.usage?.prompt_tokens,
      $ai_tokens_output: response.usage?.completion_tokens,
      $ai_tokens_total: response.usage?.total_tokens,
      $ai_trace_id: traceId,
      $ai_span_id: spanId,
      $ai_span_name: 'wikipedia_language_detect_suggest',
      $ai_temperature: 0.1,
      $ai_max_tokens: 80,
      $ai_http_status: 200,
      $ai_base_url: 'https://openrouter.ai/api/v1',
      $ai_request_url: 'https://openrouter.ai/api/v1/chat/completions',
      $ai_stop_reason: response.choices[0]?.finish_reason || undefined,
    });
    
    // Parse the response format "ARTICLE_NAME|LANGUAGE_CODE"
    const parts = result.split('|');
    if (parts.length === 2) {
      // Clean up any extra quotes or formatting issues
      const article = parts[0].trim().replace(/^["']|["']$/g, '');
      const language = parts[1].trim().replace(/^["']|["']$/g, '').toLowerCase();
      
      return {
        article: article,
        language: language
      };
    }
    
    // Fallback to English if parsing fails, clean up article name
    const cleanArticle = result.replace(/^["']|["']$/g, '');
    return {
      article: cleanArticle,
      language: priorityLanguage || 'en'
    };
  } catch (error) {
    console.error('Error suggesting Wikipedia article:', error);
    trackLLMGeneration({
      $ai_provider: 'openrouter',
      $ai_model: WIKIPEDIA_SUGGEST_MODEL,
      $ai_input: query,
      $ai_output: '',
      $ai_latency: 0,
      $ai_trace_id: traceId,
      $ai_span_id: randomUUID(),
      $ai_span_name: 'wikipedia_suggest',
      $ai_temperature: 0.1,
      $ai_max_tokens: 80,
      $ai_http_status: error instanceof Error && 'status' in error ? Number((error as any).status) : 500,
      $ai_base_url: 'https://openrouter.ai/api/v1',
      $ai_request_url: 'https://openrouter.ai/api/v1/chat/completions',
      $ai_is_error: true,
      $ai_error: error instanceof Error ? error.message : 'Wikipedia suggestion failed',
    });
    return {
      article: '',
      language: priorityLanguage || 'en'
    };
  }
}

interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: { source: string; width: number; height: number };
  pageUrl: string;
  description?: string;
  language: string;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Resolve the article summary server-side so the client needs a single
// round trip instead of suggest -> summary -> (fallback search -> summary).
async function fetchWikiSummary(article: string, language: string): Promise<WikiSummary | null> {
  try {
    const detailsUrl = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article)}`;
    const detailsResponse = await fetchWithTimeout(detailsUrl, 4000);
    if (!detailsResponse.ok) return null;
    const details = await detailsResponse.json();
    if (details.type !== 'standard' && details.type !== 'disambiguation') return null;
    return {
      title: details.title,
      extract: details.extract,
      ...(details.thumbnail ? { thumbnail: details.thumbnail } : {}),
      pageUrl: details.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(details.title)}`,
      ...(details.description ? { description: details.description } : {}),
      language,
    };
  } catch {
    return null;
  }
}

// Server-side fallback: opensearch for the top title, then its summary.
async function fallbackWikiSearch(query: string, language: string): Promise<WikiSummary | null> {
  try {
    const searchUrl = `https://${language}.wikipedia.org/w/api.php?origin=*&action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json&utf8=1`;
    const searchResponse = await fetchWithTimeout(searchUrl, 4000);
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    const topTitle = Array.isArray(searchData) && Array.isArray(searchData[1]) ? searchData[1][0] : null;
    if (!topTitle) return null;
    return fetchWikiSummary(topTitle, language);
  } catch {
    return null;
  }
}

async function GETHandler(req: NextRequest) {
  const traceId = randomUUID();
  const startTime = Date.now();
  
  const wideEvent = WideEvent.getOrCreate();
  wideEvent.setRequest({ method: 'GET', path: '/api/suggest/wikipedia' });
  wideEvent.setCustom('trace_id', traceId);
  
  const rateLimitResult = await checkRateLimit(req, '/api/suggest/wikipedia');
  if (!rateLimitResult.success) {
    wideEvent.setError({ type: 'RateLimitError', message: 'Rate limit exceeded', code: 'rate_limited' });
    wideEvent.setCustom('latency_ms', Date.now() - startTime);
    wideEvent.finish(429);
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
    return rateLimitResult.response!;
  }

  const query = req.nextUrl.searchParams.get('q');
  const browserLanguage = req.nextUrl.searchParams.get('lang');
  const searchCountry = req.nextUrl.searchParams.get('country');
  
  if (!query) {
    wideEvent.setError({ type: 'ValidationError', message: 'Missing query', code: 'missing_query' });
    wideEvent.setCustom('latency_ms', Date.now() - startTime);
    wideEvent.finish(400);
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
    return NextResponse.json({ error: 'Missing query parameter "q".' }, { status: 400 });
  }
  
  wideEvent.setCustom('query_length', query.length);
  wideEvent.setCustom('browser_language', browserLanguage || 'none');
  wideEvent.setCustom('search_country', searchCountry || 'none');

  try {
    const aiStart = Date.now();
    const result = await suggestWikipediaArticle(query, browserLanguage || undefined, searchCountry || undefined, traceId);
    const aiLatency = Date.now() - aiStart;
    
    wideEvent.setAI({
      model: WIKIPEDIA_SUGGEST_MODEL
    });
    wideEvent.setCustom('ai_latency_ms', aiLatency);
    
    if (!result.article) {
      wideEvent.setError({ type: 'AIError', message: 'No article suggested', code: 'no_article' });
      wideEvent.setCustom('latency_ms', Date.now() - startTime);
      wideEvent.finish(404);
      flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
      return NextResponse.json({ error: 'Could not suggest a Wikipedia article for the provided query.' }, { status: 404 });
    }
    
    wideEvent.setCustom('article_name', result.article);
    wideEvent.setCustom('article_language', result.language);

    // Resolve the summary inline: one round trip for the client.
    // Priority-language article first, then its fallback search, then English.
    const requestedLang = browserLanguage || undefined;
    const candidateLangs = Array.from(new Set([result.language, requestedLang, 'en'].filter(Boolean))) as string[];
    let summary: WikiSummary | null = await fetchWikiSummary(result.article, result.language);
    if (!summary) {
      summary = await fallbackWikiSearch(query, result.language);
    }
    for (const lang of candidateLangs) {
      if (summary) break;
      if (lang === result.language) continue;
      summary = await fallbackWikiSearch(query, lang);
    }

    if (!summary) {
      wideEvent.setError({ type: 'WikiError', message: 'No summary resolved', code: 'no_summary' });
      wideEvent.setCustom('latency_ms', Date.now() - startTime);
      wideEvent.finish(404);
      flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));
      return NextResponse.json({ error: 'Could not resolve a Wikipedia summary for the provided query.' }, { status: 404 });
    }

    wideEvent.setCustom('summary_language', summary.language);
    wideEvent.setCustom('latency_ms', Date.now() - startTime);
    wideEvent.finish(200);
    flushServerEvents().catch((err) => console.warn('[PostHog] Failed to flush events:', err));

    return NextResponse.json({
      article: result.article,
      language: result.language,
      title: summary.title,
      extract: summary.extract,
      ...(summary.thumbnail ? { thumbnail: summary.thumbnail } : {}),
      pageUrl: summary.pageUrl,
      ...(summary.description ? { description: summary.description } : {}),
      summaryLanguage: summary.language,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('Error in Wikipedia suggestion API:', error);
    wideEvent.setError({ type: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : 'Internal Server Error', code: 'suggest_error' });
    wideEvent.setCustom('latency_ms', duration);
    wideEvent.finish(500);
    handleAPIError(error, req, '/api/suggest/wikipedia', 'GET', 500);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export const GET = withAPIObservability(GETHandler);
