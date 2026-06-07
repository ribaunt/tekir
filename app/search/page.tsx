"use client";

import { Suspense } from 'react';
import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Search, Cat, ChevronDown, Lock, MessageCircleMore, Sparkles, Settings, Newspaper, Video, AlertTriangle, X, ShieldCheck, Copy, Check, Share2 } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSettings } from "@/lib/settings";
import { handleBangRedirect } from "@/utils/bangs";
import { fetchWithSessionRefreshAndCache, SearchCache } from "@/lib/cache";
import { apiEndpoints } from "@/lib/migration-config";
import { useAuth } from "@/components/auth-provider";
import { Input, SearchInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import SearchTabs from "@/components/search/search-tabs";
import WebResultItem from "@/components/search/web-result-item";
import { SearchResultsSkeleton } from "@/components/ui/skeleton";
import { storeRedirectUrl } from "@/lib/utils";
import {
  trackSearchPerformed,
  trackSearchResultsLoaded,
  trackSearchResultClicked,
  trackSearchTabChanged,
  trackSearchError,
  trackAIQueryInitiated,
  trackAIQueryCompleted,
  trackAIQueryFailed,
  trackAIResponseViewed,
  trackAIDiveToggled,
  trackWikipediaViewed,
  trackWikipediaExpanded,
  trackNewsClusterViewed,
  trackNewsClusterExpanded,
  trackNewsArticleClicked,
  trackVideoClusterViewed,
  trackVideoClusterExpanded,
  trackVideoClicked,
  trackPageView,
  trackClientLog,
} from "@/lib/posthog-analytics";
import { trackAsyncError, trackNetworkError } from '@/lib/client-error-tracking';

const UserProfile = dynamic(() => import("@/components/user-profile"), { ssr: false });
const Footer = dynamic(() => import("@/components/footer"), { ssr: false });
const FlyingCats = dynamic(() => import("@/components/shared/flying-cats"), { ssr: false });
const WikiNotebook = dynamic(() => import("@/components/wiki-notebook"), { ssr: false });
const FloatingFeedback = dynamic(() => import("@/components/feedback/floating-feedback"), { ssr: false });
import { useTranslations } from "next-intl";
import { getLogoMetadata } from "@/components/settings/logo-selector";

interface SearchResult {
  title: string;
  description: string;
  displayUrl: string;
  url: string;
  source: string;
  favicon?: string;
  age?: string;
  thumbnail?: string;
  profile?: {
    name?: string;
    url?: string;
    long_name?: string;
    img?: string;
  };
  sitelinks?: Array<{
    title: string;
    url: string;
    description?: string;
  }>;
}

interface Suggestion {
  query: string;
}

interface WikipediaData {
  title: string;
  extract: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  pageUrl: string;
  description?: string;
  language?: string;
}

function isExpectedAbort(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return error.name === 'AbortError' || message.includes('aborted') || message.includes('abort');
  }

  return false;
}

interface ImageSearchResult {
  title: string;
  url: string;
  source: string;
  thumbnail: {
    src: string;
  };
  properties: {
    url: string;
    placeholder: string;
  };
  meta_url: {
    netloc: string;
    path: string;
  };
}

interface NewsResult {
  title: string;
  description: string;
  url: string;
  source: string;
  age: string;
  thumbnail?: string;
  favicon?: string;
}

interface VideoResult {
  title?: string;
  name?: string;
  description?: string;
  url?: string;
  content_url?: string;
  thumbnail?: string | { src?: string; source?: string; original?: string };
  site?: string;
  source?: string;
}

interface AIAnalytics {
  query_length?: number;
  response_length?: number;
  response_time_ms?: number;
  estimated_tokens_output?: number;
}

interface AIResponseData {
  answer: string;
  _analytics?: AIAnalytics;
}

const SERP_COUNTRIES = [
  { code: "ALL", name: "All regions" },
  { code: "TR", name: "Turkey" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
];

const SAFE_SEARCH_OPTIONS = [
  { value: "off", label: "Safe: Off" },
  { value: "moderate", label: "Safe: Moderate" },
  { value: "strict", label: "Safe: Strict" },
];

const FRESHNESS_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "pd", label: "Past day" },
  { value: "pw", label: "Past week" },
  { value: "pm", label: "Past month" },
  { value: "py", label: "Past year" },
];

const DIVE_LOADING_MESSAGES = [
  "Fetching sources...",
  "Analyzing data...",
  "Creating an explanation...",
];

type SerpChooserOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function SerpChooser({
  id,
  label,
  valueLabel,
  options,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  id: string;
  label: string;
  valueLabel: string;
  options: SerpChooserOption[];
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        id={`${id}-button`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-8 max-w-[10.5rem] shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/55 focus:outline-none focus:ring-2 focus:ring-primary/35 sm:h-9 sm:max-w-none sm:gap-2 sm:px-4 sm:text-sm"
      >
        <span className="truncate">{valueLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform sm:h-4 sm:w-4 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={`${id}-button`}
          className="fixed left-3 right-3 top-36 z-[60] max-h-[min(24rem,calc(100dvh-10rem))] overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-xl sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-64 sm:max-h-none"
        >
          <div className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</div>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value || 'any'}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  onOpenChange(false);
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${selected ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/70'
                  } ${option.disabled ? 'cursor-not-allowed opacity-45' : ''}`}
              >
                <span>{option.label}</span>
                {selected && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Rename the original SearchPage component
function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";
  const { settings, updateSetting } = useSettings();
  const t = useTranslations();

  const mobileNavItems = useMemo(() => [
    { href: "/about", icon: Lock, label: t('navigation.about') },
    { href: "https://chat.tekir.co", icon: MessageCircleMore, label: t('navigation.aiChat') },
    { href: "/settings/search", icon: Settings, label: t('navigation.settings') }
  ], [t]);

  // Helper function to check if a response should hide Karakulak
  const shouldHideKarakulak = (response: string | null): boolean => {
    if (!response) return true;

    const trimmedResponse = response.trim();
    if (trimmedResponse === '') return true;

    // Common phrases that indicate the AI can't help in various languages
    const cantHelpPhrases = [
      "Sorry, I can't help you with that",
      "I can't help you with that",
      "I cannot help you with that",
      "I'm sorry, but I can't help",
      "I'm unable to help",
      "I cannot assist with that",
      "Sorry, I cannot help",
      "I'm sorry, I can't",
      "Üzgünüm, bu konuda yardımcı olamam", // Turkish
      "Yardımcı olamam",
      "Bu konuda yardımcı olamıyorum",
      "Lo siento, no puedo ayudarte", // Spanish
      "No puedo ayudarte",
      "Désolé, je ne peux pas vous aider", // French
      "Je ne peux pas vous aider",
      "Entschuldigung, ich kann nicht helfen", // German
      "Ich kann nicht helfen",
      "申し訳ありませんが、お手伝いできません", // Japanese
      "抱歉，我无法帮助您", // Chinese
      "Мне жаль, но я не могу помочь", // Russian
    ];

    return cantHelpPhrases.some(phrase =>
      trimmedResponse.toLowerCase().includes(phrase.toLowerCase())
    );
  };

  const [results, setResults] = useState<SearchResult[]>([]);
  const [videoResults, setVideoResults] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(query);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(settings.karakulakEnabled !== false);
  const { status: authStatus, user } = useAuth();
  const isAuthenticated = authStatus === 'authenticated' && !!user;
  const [searchEngine, setSearchEngine] = useState(settings.searchEngine || 'brave');
  const engineSyncRef = useRef(false);
  const engineRef = useRef(searchEngine);

  useEffect(() => {
    engineRef.current = searchEngine;
  }, [searchEngine]);

  useEffect(() => {
    const validEngine = settings.searchEngine && ['brave', 'google', 'you'].includes(settings.searchEngine);
    const finalEngine = validEngine ? settings.searchEngine : 'brave';

    if (!isAuthenticated && finalEngine === 'google') {
      if (engineRef.current !== 'brave') {
        setSearchEngine('brave');
      }
    } else if (!engineSyncRef.current || engineRef.current !== finalEngine) {
      setSearchEngine(finalEngine as 'brave' | 'google' | 'you');
      engineSyncRef.current = true;
    }
  }, [settings.searchEngine, isAuthenticated]);
  const [aiModel, setAiModel] = useState(settings.aiModel || 'gemini');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [autocompleteSource, setAutocompleteSource] = useState(settings.autocompleteSource || 'brave');
  const checkForBang = (input: string): boolean => {
    return /(?:^|\s)![a-z]+/.test((input || "").toLowerCase());
  };
  const hasBang = useMemo(() => checkForBang(searchInput), [searchInput]);

  const getEngineForMode = useCallback(
    (engine: string, mode: 'web' | 'images' | 'news' | 'videos'): 'brave' | 'google' | 'you' => {
      if (!isAuthenticated && engine === 'google') {
        return 'brave';
      }
      if (engine === 'you' && mode !== 'web') {
        return 'brave';
      }
      if (engine !== 'brave' && engine !== 'google' && engine !== 'you') {
        return 'brave';
      }
      return engine as 'brave' | 'google' | 'you';
    },
    [isAuthenticated]
  );
  const [wikiData, setWikiData] = useState<WikipediaData | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiExpanded, setWikiExpanded] = useState(false);
  const [searchType, setSearchType] = useState<'web' | 'images' | 'news' | 'videos'>(settings.searchType === 'web' || settings.searchType === 'images' || settings.searchType === 'news' || settings.searchType === 'videos' ? settings.searchType : 'web');
  const [imageResults, setImageResults] = useState<ImageSearchResult[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [newsResults, setNewsResults] = useState<NewsResult[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [aiDiveEnabled, setAiDiveEnabled] = useState(false);
  const [diveResponse, setDiveResponse] = useState<string | null>(null);
  const [diveSources, setDiveSources] = useState<Array<{ url: string, title: string, description?: string }>>([]);
  const [diveLoading, setDiveLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [diveError, setDiveError] = useState(false);
  const [karakulakCollapsed, setKarakulakCollapsed] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [freshnessFilter, setFreshnessFilter] = useState("");
  const [relatedSearches, setRelatedSearches] = useState<string[]>([]);
  const [answerCopied, setAnswerCopied] = useState(false);
  const [openSerpChooser, setOpenSerpChooser] = useState<string | null>(null);
  const [diveLoadingMessageIndex, setDiveLoadingMessageIndex] = useState(0);

  const suggestionsRef = useRef<HTMLDivElement>(null);
  const aiRequestInProgressRef = useRef<string | null>(null);
  const searchIdRef = useRef(0);
  const lastResultsQueryRef = useRef<string | null>(null);
  const lastResultsSignatureRef = useRef<string | null>(null);
  const webSearchAbortRef = useRef<AbortController | null>(null);
  const imagesAbortRef = useRef<AbortController | null>(null);
  const newsAbortRef = useRef<AbortController | null>(null);
  const videosAbortRef = useRef<AbortController | null>(null);
  const imageRetryRef = useRef(false);
  const newsRetryRef = useRef(false);
  const videoRetryRef = useRef(false);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const wikipediaAbortRef = useRef<AbortController | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);

  // Store settings values in refs to prevent effect re-runs when settings update
  const searchCountryRef = useRef(settings.searchCountry || "ALL");
  const safesearchRef = useRef(settings.safesearch || "moderate");
  const languageRef = useRef(settings.language || '');
  const tRef = useRef(t);

  // Update refs when settings change
  useEffect(() => {
    searchCountryRef.current = settings.searchCountry || "ALL";
    safesearchRef.current = settings.safesearch || "moderate";
    languageRef.current = settings.language || '';
    tRef.current = t;
  }, [settings.searchCountry, settings.safesearch, settings.language, t]);

  useEffect(() => {
    const checkQueryForBangs = async () => {
      if (!query) return;
      await handleBangRedirect(query);
    };
    checkQueryForBangs();
  }, [query]);

  useEffect(() => {
    const currentQuery = searchParams.get("q") || "";
    if (!currentQuery) {
      setResults([]);
      setLoading(false);
      setAiResponse(null);
      setDiveResponse(null);
      setDiveSources([]);
      lastResultsQueryRef.current = null;
      lastResultsSignatureRef.current = null;
      return;
    }

    const resultSignature = [
      currentQuery,
      engineRef.current,
      searchCountryRef.current,
      safesearchRef.current,
      languageRef.current,
      freshnessFilter,
    ].join("|");

    // Only clear data and refetch if the query or active result filters changed
    if (lastResultsSignatureRef.current === resultSignature) {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setResults([]);
    setWikiData(null);
    setDiveResponse(null);
    setDiveSources([]);
    setAiResponse(null);
    setSearchError(null);
    // Loading flags will be set by a dedicated effect reacting to AI/Dive mode
    // Clear previous errors on new query
    setAiError(false);
    setDiveError(false);
    aiRequestInProgressRef.current = null;
    lastResultsQueryRef.current = currentQuery;
    lastResultsSignatureRef.current = resultSignature;

    const searchId = ++searchIdRef.current;

    // Always fetch regular search results for display, regardless of Dive mode
    const engineToUse = getEngineForMode(engineRef.current, 'web');

    const fetchRegularSearch = async () => {
      // Wait for session initialization to avoid 401 on first load
      if (typeof window !== 'undefined' && !(window as any).__sessionRegistered) {
        await new Promise(resolve => {
          const handler = () => {
            window.removeEventListener('session-registered', handler);
            resolve(true);
          };
          window.addEventListener('session-registered', handler);
          // Timeout fallback
          setTimeout(() => {
            window.removeEventListener('session-registered', handler);
            resolve(true);
          }, 2000);
        });
      }

      // Abort any previous in-flight request
      if (webSearchAbortRef.current) {
        try { webSearchAbortRef.current.abort(); } catch { }
      }
      webSearchAbortRef.current = new AbortController();
      const webSignal = webSearchAbortRef.current.signal;
      const doFetch = async (engine: string) => {
        try {
          // Get user preferences from refs (updated independently of effect)
          const storedCountry = searchCountryRef.current;
          const storedSafesearch = safesearchRef.current;
          const storedLang = languageRef.current || (typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '');

          // Build query parameters
          const searchParams = new URLSearchParams({
            q: currentQuery,
            country: storedCountry,
            safesearch: storedSafesearch,
            ...(storedLang ? { lang: storedLang } : {})
          });
          if (freshnessFilter) {
            searchParams.set('freshness', freshnessFilter);
          }

          const apiUrl = `${apiEndpoints.search.pars(engine)}?${searchParams}`;

          const response = await fetchWithSessionRefreshAndCache(
            apiUrl,
            { signal: webSignal },
            {
              searchType: 'search',
              provider: engine,
              query: currentQuery,
              searchParams: {
                country: storedCountry,
                safesearch: storedSafesearch,
                ...(freshnessFilter ? { freshness: freshnessFilter } : {}),
                ...(storedLang ? { lang: storedLang } : {})
              }
            }
          );
          if (!response.ok) throw new Error(`Search API request failed for ${engine} with query "${currentQuery}" and status ${response.status}`);
          const searchData = await response.json();
          if (isMounted && searchId === searchIdRef.current) {
            const resultsArray = searchData.results || [];
            setResults(resultsArray);
            // Capture videos cluster if present
            if (Array.isArray(searchData.videos)) {
              setVideoResults(searchData.videos);
            } else {
              setVideoResults([]);
            }
            // Capture news cluster if present (normalize to NewsResult[] shape)
            if (Array.isArray(searchData.news)) {
              try {
                const normalized = searchData.news.map((n: any) => ({
                  title: n.title || n.name || '',
                  description: n.description || n.snippet || '',
                  url: n.url || n.link || '',
                  source: n.meta_url?.netloc || n.source || '',
                  age: n.age || n.page_age || '',
                  thumbnail: n.thumbnail?.src || n.thumbnail?.original || undefined
                }));
                setNewsResults(normalized);
              } catch (e) {
                setNewsResults([]);
              }
            } else {
              setNewsResults([]);
            }
            setSearchEngine(engine);
            // Mark that current results correspond to this query
            lastResultsQueryRef.current = currentQuery;
          }
          return true;
        } catch (error) {
          if (isExpectedAbort(error)) {
            return false;
          }

          if (process.env.NODE_ENV === 'development') {
            console.error(`Search failed for engine "${engine}":`, error);
          }
          trackAsyncError(error, {
            operation: `search_${engine}`,
            component: 'SearchPage',
            metadata: { query: currentQuery, searchType }
          });
          if (isMounted) {
            setSearchError(tRef.current('search.searchError'));
          }
          return false;
        }
      };

      const success = await doFetch(engineToUse);
      if (isMounted && !success && engineToUse !== "brave") {
        await doFetch("brave");
      }
      if (isMounted) {
        setLoading(false);
      }
    };

    fetchRegularSearch();

    return () => {
      isMounted = false;
      if (webSearchAbortRef.current) {
        try { webSearchAbortRef.current.abort(); } catch { }
        webSearchAbortRef.current = null;
      }
    };
  }, [searchParams, router, isAuthenticated, searchType, freshnessFilter, searchEngine, settings.searchCountry, settings.safesearch, settings.language, getEngineForMode]);

  useEffect(() => {
    if (!query || searchType !== 'images') return;
    setImageLoading(true);
    // Abort any previous images request
    if (imagesAbortRef.current) {
      try { imagesAbortRef.current.abort(); } catch { }
    }
    imagesAbortRef.current = new AbortController();
    const imgSignal = imagesAbortRef.current.signal;
    const storedLang = languageRef.current || (typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '');
    const imageEngine = getEngineForMode(searchEngine, 'images');
    const imagesUrl = `/api/images/${imageEngine}?q=${encodeURIComponent(query)}${storedLang ? `&lang=${storedLang}` : ''}`;
    fetchWithSessionRefreshAndCache(
      imagesUrl,
      { signal: imgSignal },
      {
        searchType: 'images',
        provider: imageEngine,
        query: query,
        searchParams: storedLang ? { lang: storedLang } : undefined
      }
    )
      .then((response) => {
        if (!response.ok) throw new Error(`Image search failed with status ${response.status}`);
        return response.json();
      })
      .then(async (data) => {
        if (data.results) {
          // If cached result is empty, retry once with a cache-busting param
          if (Array.isArray(data.results) && data.results.length === 0 && !imageRetryRef.current) {
            imageRetryRef.current = true;
            try {
              // Abort previous controller and create a fresh one for retry
              if (imagesAbortRef.current) {
                try { imagesAbortRef.current.abort(); } catch { }
              }
              imagesAbortRef.current = new AbortController();
              const retrySignal = imagesAbortRef.current.signal;
              const retryUrl = `${imagesUrl}&_cb=${Date.now()}`;
              const retryRes = await fetchWithSessionRefreshAndCache(
                retryUrl,
                { signal: retrySignal },
                {
                  searchType: 'images',
                  provider: imageEngine,
                  query: query,
                  searchParams: { cacheBust: '1', ...(storedLang ? { lang: storedLang } : {}) }
                }
              );
              if (!retryRes.ok) throw new Error(`Image retry failed with status ${retryRes.status}`);
              const retryData = await retryRes.json();
              if (retryData.results) setImageResults(retryData.results);
            } catch (err) {
              if (isExpectedAbort(err)) {
                return;
              }

              if (process.env.NODE_ENV === 'development') {
                console.error('Image retry failed:', err);
              }
              trackAsyncError(err, {
                operation: 'images_retry',
                component: 'SearchPage',
                metadata: { query }
              });
            } finally {
              setImageLoading(false);
            }
            return;
          }

          setImageResults(data.results);
          // Clear retry flag if we have real results
          imageRetryRef.current = false;
        }
      })
      .catch((error) => {
        if (isExpectedAbort(error)) {
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.error("Image search failed:", error);
        }
        trackNetworkError(error, imagesUrl, 'GET');
      })
      .finally(() => {
        // If a retry is in progress, its own finally will update loading; avoid clobbering
        if (!imageRetryRef.current) setImageLoading(false);
      });
    return () => {
      if (imagesAbortRef.current) {
        try { imagesAbortRef.current.abort(); } catch { }
        imagesAbortRef.current = null;
      }
    };
  }, [query, searchEngine, searchType, getEngineForMode]);

  useEffect(() => {
    if (!query || searchType !== 'videos') return;
    setVideoLoading(true);

    // Abort any previous videos request
    if (videosAbortRef.current) {
      try { videosAbortRef.current.abort(); } catch { }
    }
    videosAbortRef.current = new AbortController();
    const vidSignal = videosAbortRef.current.signal;
    const storedLang = languageRef.current || (typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '');
    const videoEngine = getEngineForMode(searchEngine, 'videos');
    const videosUrl = `/api/videos/${videoEngine}?q=${encodeURIComponent(query)}${storedLang ? `&lang=${storedLang}` : ''}`;
    fetchWithSessionRefreshAndCache(
      videosUrl,
      { signal: vidSignal },
      {
        searchType: 'videos',
        provider: videoEngine,
        query: query,
        searchParams: storedLang ? { lang: storedLang } : undefined
      }
    )
      .then((response) => {
        if (!response.ok) throw new Error(`Video search failed with status ${response.status}`);
        return response.json();
      })
      .then(async (data) => {
        if (data.results) {
          if (Array.isArray(data.results) && data.results.length === 0 && !videoRetryRef.current) {
            videoRetryRef.current = true;
            try {
              if (videosAbortRef.current) {
                try { videosAbortRef.current.abort(); } catch { }
              }
              videosAbortRef.current = new AbortController();
              const retrySignal = videosAbortRef.current.signal;
              const retryUrl = `${videosUrl}&_cb=${Date.now()}`;
              const retryRes = await fetchWithSessionRefreshAndCache(
                retryUrl,
                { signal: retrySignal },
                {
                  searchType: 'videos',
                  provider: videoEngine,
                  query: query,
                  searchParams: { cacheBust: '1', ...(storedLang ? { lang: storedLang } : {}) }
                }
              );
              if (!retryRes.ok) throw new Error(`Video retry failed with status ${retryRes.status}`);
              const retryData = await retryRes.json();
              if (retryData.results) setVideoResults(retryData.results);
            } catch (err) {
              if (isExpectedAbort(err)) {
                return;
              }

              if (process.env.NODE_ENV === 'development') {
                console.error('Video retry failed:', err);
              }
              trackAsyncError(err, {
                operation: 'videos_retry',
                component: 'SearchPage',
                metadata: { query }
              });
            } finally {
              setVideoLoading(false);
            }
            return;
          }

          setVideoResults(data.results);
          videoRetryRef.current = false;
        }
      })
      .catch((error) => {
        if (isExpectedAbort(error)) {
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.error("Video search failed:", error);
        }
        trackNetworkError(error, videosUrl, 'GET');
      })
      .finally(() => {
        if (!videoRetryRef.current) setVideoLoading(false);
      });

    return () => {
      if (videosAbortRef.current) {
        try { videosAbortRef.current.abort(); } catch { }
        videosAbortRef.current = null;
      }
    };
  }, [query, searchEngine, searchType, getEngineForMode]);

  useEffect(() => {
    if (!query || searchType !== 'news') return;
    setNewsLoading(true);

    // Get user preferences from refs
    const storedCountry = searchCountryRef.current;
    const storedSafesearch = safesearchRef.current;

    // Build query parameters
    const searchParams = new URLSearchParams({
      q: query,
      country: storedCountry,
      safesearch: storedSafesearch
    });

    if (newsAbortRef.current) {
      try { newsAbortRef.current.abort(); } catch { }
    }
    newsAbortRef.current = new AbortController();
    const newsSignal = newsAbortRef.current.signal;
    const storedLang = languageRef.current || (typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '');
    const newsEngine = getEngineForMode(searchEngine, 'news');
    const newsUrl = `/api/news/${newsEngine}?${searchParams}`;
    fetchWithSessionRefreshAndCache(
      newsUrl,
      { signal: newsSignal },
      {
        searchType: 'news',
        provider: newsEngine,
        query: query,
        searchParams: {
          country: storedCountry,
          safesearch: storedSafesearch,
          ...(storedLang ? { lang: storedLang } : {})
        }
      }
    )
      .then((response) => {
        if (!response.ok) throw new Error(`News search failed with status ${response.status}`);
        return response.json();
      })
      .then(async (data) => {
        if (data.results) {
          // If cached result is empty, retry once with cache-bust
          if (Array.isArray(data.results) && data.results.length === 0 && !newsRetryRef.current) {
            newsRetryRef.current = true;
            try {
              if (newsAbortRef.current) {
                try { newsAbortRef.current.abort(); } catch { }
              }
              newsAbortRef.current = new AbortController();
              const retrySignal = newsAbortRef.current.signal;
              const retryUrl = `${newsUrl}&_cb=${Date.now()}`;
              const retryRes = await fetchWithSessionRefreshAndCache(
                retryUrl,
                { signal: retrySignal },
                {
                  searchType: 'news',
                  provider: newsEngine,
                  query: query,
                  searchParams: { country: storedCountry, safesearch: storedSafesearch, cacheBust: '1', ...(storedLang ? { lang: storedLang } : {}) }
                }
              );
              if (!retryRes.ok) throw new Error(`News retry failed with status ${retryRes.status}`);
              const retryData = await retryRes.json();
              if (retryData.results) setNewsResults(retryData.results);
            } catch (err) {
              if (isExpectedAbort(err)) {
                return;
              }

              if (process.env.NODE_ENV === 'development') {
                console.error('News retry failed:', err);
              }
              trackAsyncError(err, {
                operation: 'news_retry',
                component: 'SearchPage',
                metadata: { query }
              });
            } finally {
              setNewsLoading(false);
            }
            return;
          }

          setNewsResults(data.results);
          newsRetryRef.current = false;
        }
      })
      .catch((error) => {
        if (isExpectedAbort(error)) {
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.error("News search failed:", error);
        }
        trackNetworkError(error, newsUrl, 'GET');
      })
      .finally(() => {
        if (!newsRetryRef.current) setNewsLoading(false);
      });
    return () => {
      if (newsAbortRef.current) {
        try { newsAbortRef.current.abort(); } catch { }
        newsAbortRef.current = null;
      }
    };
  }, [query, searchEngine, searchType, getEngineForMode]);

  // Reset retry flags when query or engine changes so new queries can retry again
  useEffect(() => {
    imageRetryRef.current = false;
    newsRetryRef.current = false;
  }, [query, searchEngine]);



  // Regular AI (Karakulak) — fire immediately in parallel when Dive mode is OFF
  useEffect(() => {
    if (!query) {
      aiRequestInProgressRef.current = null;
      if (aiAbortControllerRef.current) {
        try { aiAbortControllerRef.current.abort(); } catch { }
        aiAbortControllerRef.current = null;
      }
      return;
    }
    if (!aiEnabled || aiDiveEnabled) {
      return;
    }
    if (aiModel === undefined && localStorage.getItem("aiModel") !== null) {
      return;
    }

    const modelToUse = aiModel || "gemini";
    const requestKey = `${query}-ai-${modelToUse}`;
    if (aiRequestInProgressRef.current === requestKey) return;

    const isModelEnabled = (model: string) => {
      const stored = localStorage.getItem(`karakulakEnabled_${model}`);
      return stored !== "false";
    };

    const makeAIRequest = async (model: string, isRetry: boolean = false) => {
      try {
        const cachedResponse = SearchCache.getAI(model, query);
        if (cachedResponse) {
          setAiResponse(cachedResponse);
          setDiveResponse(null);
          setDiveSources([]);
          setAiLoading(false);
          setDiveLoading(false);
          setAiError(false);
          aiRequestInProgressRef.current = null;
          return;
        }

        aiRequestInProgressRef.current = requestKey;
        setAiLoading(true);
        setDiveLoading(false);
        setAiError(false);
        if (aiAbortControllerRef.current) {
          try { aiAbortControllerRef.current.abort(); } catch { }
        }
        aiAbortControllerRef.current = new AbortController();

        // Track AI query initiation
        trackAIQueryInitiated(model, query.length, false);

        const res = await fetchWithSessionRefreshAndCache(`/api/karakulak/${model}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: query }),
          signal: aiAbortControllerRef.current.signal
        }, {
          searchType: 'ai',
          provider: model,
          query,
          searchParams: {}
        });

        if (!res.ok) {
          throw new Error(`API returned status ${res.status}`);
        }

        const aiData = await res.json();
        const aiResult = (aiData.answer || '').trim();
        setAiResponse(aiResult);
        setDiveResponse(null);
        setDiveSources([]);
        SearchCache.setAI(model, query, aiResult);

        // Capture AI analytics events in PostHog
        if (aiResult) {
          const analytics = (aiData as AIResponseData)._analytics;
          // Track query completion
          trackAIQueryCompleted({
            model: model as any,
            query_length: analytics?.query_length || query.length,
            response_length: analytics?.response_length || aiResult.length,
            response_time_ms: analytics?.response_time_ms,
            is_dive_mode: false,
            estimated_tokens: analytics?.estimated_tokens_output,
          });
          // Track response viewed
          trackAIResponseViewed({
            model: model as any,
            query_length: analytics?.query_length,
            response_length: analytics?.response_length || aiResult.length,
            response_time_ms: analytics?.response_time_ms,
            is_dive_mode: false,
            estimated_tokens: analytics?.estimated_tokens_output,
          });
        }

        setAiLoading(false);
        setDiveLoading(false);
        setAiError(false);
        aiRequestInProgressRef.current = null;
        aiAbortControllerRef.current = null;
      } catch (error) {
        if (isExpectedAbort(error)) {
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.error(`AI response failed for model ${model}:`, error);
        }

        // Track AI query failure
        trackAIQueryFailed(model, 'network_error', false);

        if (!isRetry && model !== "gemini" && !aiModel && !aiDiveEnabled) {
          makeAIRequest("gemini", true);
        } else {
          setAiLoading(false);
          setDiveLoading(false);
          setAiError(true);
          aiRequestInProgressRef.current = null;
          aiAbortControllerRef.current = null;
        }
      }
    };

    if (isModelEnabled(modelToUse)) {
      makeAIRequest(modelToUse);
    } else {
      aiRequestInProgressRef.current = null;
    }

    return () => {
      if (aiAbortControllerRef.current) {
        try { aiAbortControllerRef.current.abort(); } catch { }
        aiAbortControllerRef.current = null;
      }
    };
  }, [query, aiEnabled, aiModel, aiDiveEnabled]);

  // Dive Mode — wait for web results to arrive, then send Dive request in parallel
  useEffect(() => {
    if (!query) {
      aiRequestInProgressRef.current = null;
      if (aiAbortControllerRef.current) {
        try { aiAbortControllerRef.current.abort(); } catch { }
        aiAbortControllerRef.current = null;
      }
      return;
    }
    if (!aiEnabled || !aiDiveEnabled) {
      return;
    }

    const searchId = searchIdRef.current;
    const requestKey = `${query}-dive`;
    if (aiRequestInProgressRef.current === requestKey) return;

    // If cached, use immediately
    const cachedDiveResponse = SearchCache.getDive(query);
    if (cachedDiveResponse) {
      setDiveResponse(cachedDiveResponse.response);
      setDiveSources(cachedDiveResponse.sources || []);
      setDiveLoading(false);
      setAiResponse(null);
      setAiLoading(false);
      aiRequestInProgressRef.current = null;
      return;
    }

    const hasFreshResults = results.length > 0 && lastResultsQueryRef.current === query;
    if (!hasFreshResults) {
      setDiveLoading(true);
      return;
    }

    const candidateResults = results.slice(0, 8).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.description
    }));

    const makeDiveRequest = async () => {
      try {
        aiRequestInProgressRef.current = requestKey;
        setDiveLoading(true);
        setAiLoading(false);
        setDiveError(false);
        if (aiAbortControllerRef.current) {
          try { aiAbortControllerRef.current.abort(); } catch { }
        }
        aiAbortControllerRef.current = new AbortController();

        // Track Dive query initiation
        trackAIQueryInitiated('dive', query.length, true);

        const diveResponse = await fetchWithSessionRefreshAndCache('/api/dive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, pages: candidateResults }),
          signal: aiAbortControllerRef.current.signal
        }, {
          searchType: 'dive',
          provider: 'dive',
          query,
          searchParams: { candidates: String(candidateResults.length) }
        });

        if (!diveResponse.ok) {
          throw new Error(`Dive API failed with status ${diveResponse.status}`);
        }

        const diveData = await diveResponse.json();
        if (searchId === searchIdRef.current) {
          setDiveResponse(diveData.response);
          setDiveSources(diveData.sources || []);
          setAiResponse(null);
          SearchCache.setDive(query, diveData.response, diveData.sources || []);
          setDiveError(false);

          // Capture Dive AI analytics events
          if (diveData.response) {
            trackAIQueryCompleted({
              model: 'dive',
              response_length: diveData.response.length,
              is_dive_mode: true,
              sources_count: (diveData.sources || []).length,
            });
            trackAIResponseViewed({
              model: 'dive',
              response_length: diveData.response.length,
              is_dive_mode: true,
              sources_count: (diveData.sources || []).length,
            });
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            trackClientLog('dive_response_stale_ignored');
          }
        }

        setDiveLoading(false);
        setAiLoading(false);
        aiRequestInProgressRef.current = null;
        aiAbortControllerRef.current = null;
      } catch (error) {
        if (isExpectedAbort(error)) {
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.error('Dive request failed:', error);
        }

        // Track Dive query failure
        trackAIQueryFailed('dive', 'network_error', true);

        setDiveLoading(false);
        setAiLoading(false);
        setDiveError(true);
        aiRequestInProgressRef.current = null;
        aiAbortControllerRef.current = null;
      }
    };

    makeDiveRequest();

    return () => {
      if (aiAbortControllerRef.current) {
        try { aiAbortControllerRef.current.abort(); } catch { }
        aiAbortControllerRef.current = null;
      }
    };
  }, [query, aiEnabled, aiDiveEnabled, results]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    const trimmed = searchInput.trim();
    if (trimmed) {
      const redirected = await handleBangRedirect(trimmed);
      if (!redirected) {
        // Capture search event in PostHog (consent-aware)
        trackSearchPerformed({
          search_type: searchType,
          search_engine: searchEngine as 'brave' | 'google' | 'you',
          query_length: trimmed.length,
          has_ai_enabled: aiEnabled,
          has_dive_enabled: aiDiveEnabled,
        });

        const params = new URLSearchParams();
        params.set("q", trimmed);
        router.push(`/search?${params.toString()}`);
      }
    }
  };

  const handleToggleAiDive = () => {
    // Track Dive toggle
    trackAIDiveToggled(!aiDiveEnabled);

    // Clear any in-progress request when switching modes
    aiRequestInProgressRef.current = null;
    // Abort in-flight AI/Dive request when toggling mode
    if (aiAbortControllerRef.current) {
      try { aiAbortControllerRef.current.abort(); } catch { }
      aiAbortControllerRef.current = null;
    }
    setAiDiveEnabled(prevAiDiveEnabled => {
      const next = !prevAiDiveEnabled;
      if (aiEnabled) {
        if (next) {
          // Switching to Dive mode - check for cached data first
          const cachedDiveResponse = SearchCache.getDive(query);
          if (cachedDiveResponse) {
            // If cached data exists, set it immediately without clearing current text
            setDiveResponse(cachedDiveResponse.response);
            setDiveSources(cachedDiveResponse.sources || []);
            setAiResponse(null);
            setDiveLoading(false);
            setAiLoading(false);
          } else {
            // No cached data - clear and show loading
            setAiResponse(null);
            setDiveResponse(null);
            setDiveSources([]);
          }
        } else {
          // Switching to AI mode - check for cached data first
          const cachedAIResponse = SearchCache.getAI(aiModel || "gemini", query);
          if (cachedAIResponse) {
            // If cached data exists, set it immediately without clearing current text
            setAiResponse(cachedAIResponse);
            setDiveResponse(null);
            setDiveSources([]);
            setAiLoading(false);
            setDiveLoading(false);
          } else {
            // No cached data - clear and show loading
            setAiResponse(null);
            setDiveResponse(null);
            setDiveSources([]);
          }
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchInput.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      // Include user settings (country, safesearch, lang) in the cache key so
      // suggestions are scoped to these preferences. Use query-string style so
      // keys look like: autocomplete-brave-pornhub?country=ALL&lang=en&safesearch=off
      const country = searchCountryRef.current;
      const safesearch = safesearchRef.current;
      const lang = languageRef.current || (typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '');
      const baseKey = `autocomplete-${autocompleteSource}-${searchInput.trim().toLowerCase()}`;
      const _paramsForKey = new URLSearchParams();
      // ensure requested order: country, lang, safesearch
      _paramsForKey.set('country', country);
      if (lang) _paramsForKey.set('lang', lang);
      _paramsForKey.set('safesearch', safesearch);
      const cacheKey = `${baseKey}?${_paramsForKey.toString()}`;
      const cached = typeof window !== 'undefined' ? sessionStorage.getItem(cacheKey) : null;
      if (!(window as any).__autocompleteRetryMap) (window as any).__autocompleteRetryMap = {};
      const retryMap: Record<string, boolean> = (window as any).__autocompleteRetryMap;
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSuggestions(parsed);
            return;
          }
          if (Array.isArray(parsed) && parsed.length === 0 && retryMap[cacheKey]) {
            setSuggestions([]);
            return;
          }
          // else fallthrough to fetch
        } catch (e) {
          // parsing error -> fallthrough
        }
      }

      try {
        if (suggestionsAbortRef.current) {
          try { suggestionsAbortRef.current.abort(); } catch { }
        }
        suggestionsAbortRef.current = new AbortController();
        const sugSignal = suggestionsAbortRef.current.signal;

        const fetchSuggestionsForLang = async (langParam?: string) => {
          const params = new URLSearchParams();
          params.set('q', searchInput);
          if (country) params.set('country', country);
          if (safesearch) params.set('safesearch', safesearch);
          if (langParam) params.set('lang', langParam);
          const response = await fetchWithSessionRefreshAndCache(`/api/autocomplete/${autocompleteSource}?${params.toString()}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: sugSignal,
          });
          if (!response.ok) throw new Error(`Autocomplete fetch failed with status ${response.status}`);
          const data = await response.json();

          if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
            return data[1].map((suggestion) => ({ query: suggestion }));
          }

          if (process.env.NODE_ENV === 'development') {
            console.warn('Unexpected suggestion format:', data);
          }
          return [] as Suggestion[];
        };

        let processedSuggestions: Suggestion[] = [];

        try {
          processedSuggestions = await fetchSuggestionsForLang(lang || undefined);
        } catch (primaryError) {
          if (isExpectedAbort(primaryError)) {
            throw primaryError;
          }

          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to fetch suggestions for current language:', primaryError);
          }
        }

        if (processedSuggestions.length === 0 && lang && lang.toLowerCase() !== 'en') {
          try {
            const fallbackSuggestions = await fetchSuggestionsForLang('en');
            if (fallbackSuggestions.length > 0) {
              processedSuggestions = fallbackSuggestions;
            }
          } catch (fallbackError) {
            if (isExpectedAbort(fallbackError)) {
              throw fallbackError;
            }

            if (process.env.NODE_ENV === 'development') {
              console.error('Fallback autocomplete fetch failed:', fallbackError);
            }
          }
        }

        setSuggestions(processedSuggestions);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(processedSuggestions)); } catch { }

        if (processedSuggestions.length === 0) {
          retryMap[cacheKey] = true;
        } else if (retryMap[cacheKey]) {
          delete retryMap[cacheKey];
        }
      } catch (error) {
        if (isExpectedAbort(error)) {
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch suggestions:', error);
        }
        setSuggestions([]);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 200);
    return () => {
      clearTimeout(timeoutId);
      if (suggestionsAbortRef.current) {
        try { suggestionsAbortRef.current.abort(); } catch { }
        suggestionsAbortRef.current = null;
      }
    };
  }, [searchInput, autocompleteSource]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          const selected = suggestions[selectedIndex];
          setSearchInput(selected.query);
          router.push(`/search?q=${encodeURIComponent(selected.query)}`);
          setShowSuggestions(false);
        } else {
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  useEffect(() => {
    if (query) {
      document.title = `${query} - Tekir`;
    } else {
      document.title = "Tekir";
    }
  }, [query]);

  useEffect(() => {
    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const start = 120;
        const span = 220;
        const raw = Math.min(1, Math.max(0, (y - start) / span));
        const eased = easeOutCubic(raw);
        setScrollProgress(eased);
        setIsScrolled(y > start);
        rafId = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        showSuggestions) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSuggestions]);

  useEffect(() => {
    if (!openSerpChooser) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('[data-serp-chooser]')) {
        setOpenSerpChooser(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenSerpChooser(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openSerpChooser]);

  useEffect(() => {
    if (!aiDiveEnabled || !diveLoading) {
      setDiveLoadingMessageIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setDiveLoadingMessageIndex((index) => (index + 1) % DIVE_LOADING_MESSAGES.length);
    }, 1600);

    return () => window.clearInterval(intervalId);
  }, [aiDiveEnabled, diveLoading]);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setWikiData(null);
      return;
    }

    const fetchWikipediaData = async () => {
      setWikiLoading(true);
      try {
        // Get browser language (first 2 characters of the locale)
        const browserLanguage = settings.language || navigator.language?.slice(0, 2);

        // Get search country from settings
        const searchCountry = settings.searchCountry || "ALL";

        // Check cache first
        const cachedWikiData = SearchCache.getWikipedia(query, browserLanguage);
        if (cachedWikiData) {
          if (process.env.NODE_ENV === 'development') {
            trackClientLog('wikipedia_cache_hit');
          }
          setWikiData(cachedWikiData);
          setWikiLoading(false);
          return;
        }

        // Abort any in-flight Wikipedia requests
        if (wikipediaAbortRef.current) {
          try { wikipediaAbortRef.current.abort(); } catch { }
        }
        wikipediaAbortRef.current = new AbortController();
        const wikiSignal = wikipediaAbortRef.current.signal;

        // Build Wikipedia suggestion API URL with priority parameters
        const suggestionUrl = new URL(`/api/suggest/wikipedia`, window.location.origin);
        suggestionUrl.searchParams.set('q', query);

        if (browserLanguage) {
          suggestionUrl.searchParams.set('lang', browserLanguage);
        }

        if (searchCountry) {
          suggestionUrl.searchParams.set('country', searchCountry);
        }

        const suggestionResponse = await fetchWithSessionRefreshAndCache(suggestionUrl.toString(), { signal: wikiSignal });

        if (!suggestionResponse.ok) {
          throw new Error(`Wikipedia suggestion API failed: ${suggestionResponse.status}`);
        }

        const suggestionData = await suggestionResponse.json();

        const articleTitle = suggestionData.article;
        const language = suggestionData.language || 'en';

        if (articleTitle) {
          const detailsUrl = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;
          const detailsResponse = await fetch(detailsUrl, { signal: wikiSignal });
          const details = await detailsResponse.json();

          if (details.type === "standard" || details.type === "disambiguation") {
            const wikipediaData: WikipediaData = {
              title: details.title,
              extract: details.extract,
              pageUrl: details.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(details.title)}`,
              ...(details.thumbnail && { thumbnail: details.thumbnail }),
              description: details.description,
              language: language,
            };

            // Cache the successful result
            SearchCache.setWikipedia(query, wikipediaData, browserLanguage);
            setWikiData(wikipediaData);
          } else {
            await fallbackToWikipediaSearch(language);
          }
        } else {
          await fallbackToWikipediaSearch(language);
        }
      } catch (error) {
        if (isExpectedAbort(error)) {
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.error("Failed to fetch Wikipedia data:", error);
        }
        setWikiData(null);
      } finally {
        setWikiLoading(false);
      }
    };

    const fallbackToWikipediaSearch = async (language: string = 'en') => {
      try {
        const searchUrl = `https://${language}.wikipedia.org/w/api.php?origin=*&action=query&list=search&srsearch=${encodeURIComponent(
          query
        )}&format=json&utf8=1`;

        const searchResponse = await fetch(searchUrl, { signal: wikipediaAbortRef.current?.signal });
        const searchData = await searchResponse.json();

        if (searchData.query?.search?.length > 0) {
          const topResult = searchData.query.search[0];
          const pageTitle = topResult.title;

          const detailsUrl = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
          const detailsResponse = await fetch(detailsUrl, { signal: wikipediaAbortRef.current?.signal });
          const details = await detailsResponse.json();

          if (details.type === "standard" || details.type === "disambiguation") {
            const wikipediaData: WikipediaData = {
              title: details.title,
              extract: details.extract,
              pageUrl: details.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(details.title)}`,
              ...(details.thumbnail && { thumbnail: details.thumbnail }),
              description: details.description,
              language: language,
            };

            // Cache the fallback result as well
            const browserLanguage = settings.language || navigator.language?.slice(0, 2);
            SearchCache.setWikipedia(query, wikipediaData, browserLanguage);
            setWikiData(wikipediaData);
          } else {
            setWikiData(null);
          }
        } else {
          setWikiData(null);
        }
      } catch (error) {
        if (isExpectedAbort(error)) {
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          console.error("Fallback Wikipedia search failed:", error);
        }
        setWikiData(null);
      }
    };

    if (!hasBang) {
      // Check if Wikipedia is enabled in settings before fetching
      if (settings.wikipediaEnabled !== false) {
        fetchWikipediaData();
      } else {
        setWikiData(null);
      }
    } else {
      setWikiData(null);
    }

    return () => {
      if (wikipediaAbortRef.current) {
        try { wikipediaAbortRef.current.abort(); } catch { }
        wikipediaAbortRef.current = null;
      }
    };
  }, [query, hasBang, settings.wikipediaEnabled, settings.language, settings.searchCountry]);

  useEffect(() => {
    if (settings.searchType && ['web', 'images', 'news', 'videos'].includes(settings.searchType)) {
      setSearchType(settings.searchType as 'web' | 'images' | 'news' | 'videos');
    }
  }, [settings.searchType]);

  useEffect(() => {
    if (!query || query.trim().length < 2 || searchType !== 'web') {
      setRelatedSearches([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fallbackRelated = (value: string) => {
      const trimmed = value.trim();
      return [
        `${trimmed} news`,
        `${trimmed} meaning`,
        `${trimmed} examples`,
        `${trimmed} vs`,
        `best ${trimmed}`,
        `${trimmed} reddit`,
      ];
    };

    const loadRelated = async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          country: searchCountryRef.current,
          safesearch: safesearchRef.current,
        });
        const lang = languageRef.current || (typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '');
        if (lang) params.set('lang', lang);

        const response = await fetchWithSessionRefreshAndCache(`/api/autocomplete/${autocompleteSource}?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Related search fetch failed with status ${response.status}`);

        const data = await response.json();
        const items = Array.isArray(data) && Array.isArray(data[1])
          ? data[1].map((item: unknown) => String(item)).filter(Boolean)
          : [];
        const combined = [...items, ...fallbackRelated(query)]
          .filter((item) => item.toLowerCase() !== query.toLowerCase());
        const unique = Array.from(new Set(combined.map((item) => item.trim()).filter(Boolean))).slice(0, 8);

        if (!cancelled) {
          setRelatedSearches(unique);
        }
      } catch {
        if (!cancelled) {
          setRelatedSearches(fallbackRelated(query).slice(0, 6));
        }
      }
    };

    const timeoutId = setTimeout(loadRelated, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, searchType, autocompleteSource, settings.searchCountry, settings.safesearch, settings.language]);

  const handleSearchTypeChange = (type: 'web' | 'images' | 'news' | 'videos') => {
    // Track tab change in analytics
    trackSearchTabChanged(searchType, type);

    // Immediately clear stale results and show loading skeletons so the UI
    // doesn't flash a "No results" state while the fetch starts.
    if (type === 'images') {
      // clear previous images and show skeleton if we have a query
      setImageResults([]);
      if (imagesAbortRef.current) {
        try { imagesAbortRef.current.abort(); } catch { }
        imagesAbortRef.current = null;
      }
      if (query) setImageLoading(true);
    } else {
      // turning off images tab
      setImageLoading(false);
    }

    if (type === 'news') {
      // clear previous news and show skeleton if we have a query
      setNewsResults([]);
      if (newsAbortRef.current) {
        try { newsAbortRef.current.abort(); } catch { }
        newsAbortRef.current = null;
      }
      if (query) setNewsLoading(true);
    } else {
      setNewsLoading(false);
    }

    if (type === 'videos') {
      // clear previous videos and show skeleton if we have a query
      setVideoResults([]);
      if (videosAbortRef.current) {
        try { videosAbortRef.current.abort(); } catch { }
        videosAbortRef.current = null;
      }
      if (query) setVideoLoading(true);
    } else {
      setVideoLoading(false);
    }

    setSearchType(type);
    updateSetting("searchType", type);

    // Note: the existing useEffect hooks (watching searchType/query) will
    // perform the actual fetch. We only prepare UI state here so skeletons
    // render immediately when the user switches tabs.
  };

  const handleSerpCountryChange = (country: string) => {
    void updateSetting("searchCountry", country);
    lastResultsSignatureRef.current = null;
  };

  const handleSerpSafeSearchChange = (value: string) => {
    void updateSetting("safesearch", value);
    lastResultsSignatureRef.current = null;
  };

  const handleSerpProviderChange = (value: string) => {
    const nextEngine = getEngineForMode(value, searchType);
    setSearchEngine(nextEngine);
    void updateSetting("searchEngine", nextEngine);
    lastResultsSignatureRef.current = null;
  };

  const handleFreshnessChange = (value: string) => {
    setFreshnessFilter(value);
    lastResultsSignatureRef.current = null;
  };

  const copyAnswer = async () => {
    const text = diveResponse || aiResponse;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setAnswerCopied(true);
      setTimeout(() => setAnswerCopied(false), 1600);
    } catch {
      setAnswerCopied(false);
    }
  };

  const shareAnswer = async () => {
    const text = diveResponse || aiResponse;
    if (!text) return;
    const shareUrl = typeof window !== 'undefined' ? window.location.href : undefined;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `Tekir: ${query}`, text, url: shareUrl });
      } catch {
        // User-cancelled shares do not need UI noise.
      }
      return;
    }
    await copyAnswer();
  };

  const [isNewsInlineOpen, setIsNewsInlineOpen] = useState(true);
  const [isNewsBottomOpen, setIsNewsBottomOpen] = useState(true);
  const [isVideosInlineOpen, setIsVideosInlineOpen] = useState(true);
  const [isVideosBottomOpen, setIsVideosBottomOpen] = useState(true);

  // Easter egg: show flying cats when query contains "cat" in common languages
  const catEasterEgg = (() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return false;
    const tokens = q.split(/\W+/).filter(Boolean);
    const words = new Set(["cat", "cats", "kedi", "katze", "gatto"]);
    return tokens.some((t) => words.has(t));
  })();

  const [selectedLogoState, setSelectedLogoState] = useState<'tekir' | 'duman' | 'pamuk' | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    const settingsLogo = settings.selectedLogo || 'tekir';
    const finalLogo = (settingsLogo === 'tekir' || settingsLogo === 'duman' || settingsLogo === 'pamuk') ? settingsLogo : 'tekir';
    if (finalLogo !== selectedLogoState) {
      setSelectedLogoState(finalLogo as 'tekir' | 'duman' | 'pamuk');
    }
    setLogoLoaded(true);
  }, [settings.selectedLogo, selectedLogoState]);

  const logoMetadata = selectedLogoState ? getLogoMetadata(selectedLogoState) : getLogoMetadata('tekir');

  // Helper to normalize thumbnail values which may be a string or an object
  type ThumbnailValue = string | { src?: string; source?: string; original?: string } | null | undefined;
  const resolveImageSrc = (t: ThumbnailValue): string | null => {
    if (!t) return null;
    if (typeof t === 'string') return t;
    if (t.src) return t.src;
    if (t.source) return t.source;
    if (t.original) return t.original;
    return null;
  };

  // Precompute whether the Karakulak box should be shown to simplify JSX
  const showKarakulak = (() => {
    if (searchType !== 'web' || !aiEnabled) return false;
    const hasSomething = !!(aiResponse || diveResponse || aiLoading || diveLoading);
    if (!hasSomething) return false;
    if (aiLoading || diveLoading) return true;
    const activeResponse = diveResponse || aiResponse;
    return !shouldHideKarakulak(activeResponse);
  })();

  // Render the main results area. Extracted to avoid large nested JSX/ternaries
  const renderResultsArea = () => {
    if (searchType === 'web') {
      if (loading) {
        return <SearchResultsSkeleton />;
      }

      if (results.length > 0) {
        return (
          <div className="space-y-6">
            {results.map((result, index) => (
              <div key={`result-${index}`}>
                <WebResultItem result={result} priority={index < 3} />

                {/* Insert News cluster after 4th result (index 3) */}
                {index === 3 && settings.enchantedResults !== false && newsResults && newsResults.length > 0 && (
                  <div className="mt-8 mb-8">
                    <button
                      onClick={() => setIsNewsInlineOpen(v => !v)}
                      className="w-full text-left flex items-center justify-between"
                      aria-expanded={isNewsInlineOpen}
                      aria-controls="news-inline-cluster"
                    >
                      <div className="flex items-center gap-2">
                        <Newspaper className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-sm mb-0 font-medium text-muted-foreground">News</h3>
                      </div>
                      <ChevronDown className={`ml-2 transform transition-transform duration-200 ${isNewsInlineOpen ? 'rotate-180' : 'rotate-0'}`} />
                    </button>
                    {!isNewsInlineOpen && (
                      <p className="text-xs text-muted-foreground mt-2">{t('search.newsClusterDescription')}</p>
                    )}
                    {isNewsInlineOpen && (
                      <div className="relative mt-4 mb-4 blurry-outline cluster-enter">
                        <div className="relative">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {newsResults.slice(0, 4).map((article, idx) => (
                              <a key={`news-${idx}`} href={article.url || '#'} target="_blank" rel="noopener noreferrer" className="flex gap-3 items-start group hover:shadow-md p-2 rounded-lg bg-card border border-border transition-colors">
                                <div className="w-28 h-16 flex-shrink-0 overflow-hidden rounded-md bg-muted relative">
                                  {resolveImageSrc(article.thumbnail) ? (
                                    <Image src={resolveImageSrc(article.thumbnail)!} alt={article.title} fill unoptimized className="object-cover group-hover:scale-105 transition-transform" sizes="112px" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                      <Newspaper className="w-6 h-6" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <h4 className="text-base font-semibold line-clamp-2 mb-1 group-hover:text-primary">{article.title}</h4>
                                  {article.description && <p className="text-sm text-muted-foreground line-clamp-2">{article.description}</p>}
                                  <div className="text-xs text-muted-foreground mt-2">{(article.source || '')}{article.age ? ` • ${article.age}` : ''}</div>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Insert Videos cluster after 9th result (index 8) */}
                {index === 8 && settings.enchantedResults !== false && videoResults && videoResults.length > 0 && (
                  <div className="mt-8 mb-8 blurry-outline">
                    <button
                      onClick={() => setIsVideosInlineOpen(v => !v)}
                      className="w-full text-left flex items-center justify-between"
                      aria-expanded={isVideosInlineOpen}
                      aria-controls="videos-inline-cluster"
                    >
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-sm text-muted-foreground mb-0 font-medium">Videos</h3>
                      </div>
                      <ChevronDown className={`ml-2 transform transition-transform duration-200 ${isVideosInlineOpen ? 'rotate-180' : 'rotate-0'}`} />
                    </button>
                    {!isVideosInlineOpen && (
                      <p className="text-xs text-muted-foreground mt-2">{t('search.videosClusterDescription')}</p>
                    )}
                    {isVideosInlineOpen && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4 cluster-enter">
                        {videoResults.slice(0, 4).map((v, idx) => (
                          <a key={`video-${idx}`} href={v.url || v.content_url || '#'} target="_blank" rel="noopener noreferrer" className="flex gap-3 items-start group hover:shadow-md p-2 rounded-lg bg-card border border-border transition-colors">
                            <div className="w-32 h-20 flex-shrink-0 overflow-hidden rounded-md bg-muted relative">
                              {resolveImageSrc(v.thumbnail) ? (
                                <Image src={resolveImageSrc(v.thumbnail)!} alt={v.title || t('search.videoFallback')} fill unoptimized className="object-cover group-hover:scale-105 transition-transform" sizes="128px" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <Search className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="text-base font-semibold line-clamp-2 mb-1 group-hover:text-primary">{v.title || v.name}</h4>
                              {v.description && <p className="text-sm text-muted-foreground line-clamp-2">{v.description}</p>}
                              <div className="text-xs text-muted-foreground mt-2">{v.site || v.source || ''}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* If results are short, keep the clusters at the bottom as a fallback */}
            {results.length <= 3 && settings.enchantedResults !== false && newsResults && newsResults.length > 0 && (
              <div className="mt-8 mb-8">
                <button
                  onClick={() => setIsNewsBottomOpen(v => !v)}
                  className="w-full text-left flex items-center justify-between"
                  aria-expanded={isNewsBottomOpen}
                  aria-controls="news-bottom-cluster"
                >
                  <div className="flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm text-muted-foreground mb-0 font-medium">News</h3>
                  </div>
                  <ChevronDown className={`ml-2 transform transition-transform duration-200 ${isNewsBottomOpen ? 'rotate-180' : 'rotate-0'}`} />
                </button>
                {!isNewsBottomOpen && (
                  <p className="text-xs text-muted-foreground mt-2">{t('search.newsClusterDescription')}</p>
                )}
                {isNewsBottomOpen && (
                  <div className="relative mt-4 mb-4 blurry-outline cluster-enter">
                    <div className="absolute -inset-x-4 -top-3 h-1 bg-blue-500 rounded-sm opacity-80" />
                    <div className="absolute -inset-x-4 -bottom-3 h-1 bg-blue-500 rounded-sm opacity-80" />
                    <div className="absolute -left-3 -inset-y-3 w-1 bg-blue-500 rounded-sm opacity-80" />
                    <div className="absolute -right-3 -inset-y-3 w-1 bg-blue-500 rounded-sm opacity-80" />
                    <div className="relative">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {newsResults.slice(0, 4).map((article, idx) => (
                          <a key={`news-bottom-${idx}`} href={article.url || '#'} target="_blank" rel="noopener noreferrer" className="flex gap-3 items-start group hover:shadow-md p-2 rounded-lg bg-card border border-border transition-colors">
                            <div className="w-28 h-16 flex-shrink-0 overflow-hidden rounded-md bg-muted relative">
                              {resolveImageSrc(article.thumbnail) ? (
                                <Image src={resolveImageSrc(article.thumbnail)!} alt={article.title} fill unoptimized className="object-cover group-hover:scale-105 transition-transform" sizes="112px" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <Newspaper className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="text-base font-semibold line-clamp-2 mb-1 group-hover:text-primary">{article.title}</h4>
                              {article.description && <p className="text-sm text-muted-foreground line-clamp-2">{article.description}</p>}
                              <div className="text-xs text-muted-foreground mt-2">{(article.source || '')}{article.age ? ` • ${article.age}` : ''}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {results.length <= 8 && settings.enchantedResults !== false && videoResults && videoResults.length > 0 && (
              <div className="mt-8 mb-8 blurry-outline">
                <button
                  onClick={() => setIsVideosBottomOpen(v => !v)}
                  className="w-full text-left flex items-center justify-between"
                  aria-expanded={isVideosBottomOpen}
                  aria-controls="videos-bottom-cluster"
                >
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm text-muted-foreground mb-0 font-medium">Videos</h3>
                  </div>
                  <ChevronDown className={`ml-2 transform transition-transform duration-200 ${isVideosBottomOpen ? 'rotate-180' : 'rotate-0'}`} />
                </button>
                {!isVideosBottomOpen && (
                  <p className="text-xs text-muted-foreground mt-2">{t('search.videosClusterDescription')}</p>
                )}
                {isVideosBottomOpen && (
                  <div className="relative mt-4 mb-4 cluster-enter">
                    <div className="absolute -inset-x-4 -top-3 h-1 bg-purple-500 rounded-sm opacity-80" />
                    <div className="absolute -inset-x-4 -bottom-3 h-1 bg-purple-500 rounded-sm opacity-80" />
                    <div className="absolute -left-3 -inset-y-3 w-1 bg-purple-500 rounded-sm opacity-80" />
                    <div className="absolute -right-3 -inset-y-3 w-1 bg-purple-500 rounded-sm opacity-80" />
                    <div className="relative">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {videoResults.slice(0, 4).map((v, idx) => (
                          <a key={`video-bottom-${idx}`} href={v.url || v.content_url || '#'} target="_blank" rel="noopener noreferrer" className="flex gap-3 items-start group hover:shadow-md p-2 rounded-lg bg-card border border-border transition-colors">
                            <div className="w-32 h-20 flex-shrink-0 overflow-hidden rounded-md bg-muted relative">
                              {resolveImageSrc(v.thumbnail) ? (
                                <Image src={resolveImageSrc(v.thumbnail)!} alt={v.title || t('search.videoFallback')} fill unoptimized className="object-cover group-hover:scale-105 transition-transform" sizes="128px" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <Search className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="text-base font-semibold line-clamp-2 mb-1 group-hover:text-primary">{v.title || v.name}</h4>
                              {v.description && <p className="text-sm text-muted-foreground line-clamp-2">{v.description}</p>}
                              <div className="text-xs text-muted-foreground mt-2">{v.site || v.source || ''}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {relatedSearches.length > 0 && (
              <section className="mt-10 border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">{t('search.relatedSearches')}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {relatedSearches.map((related) => (
                    <button
                      key={related}
                      type="button"
                      onClick={() => {
                        setSearchInput(related);
                        router.push(`/search?q=${encodeURIComponent(related)}`);
                      }}
                      className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/70"
                    >
                      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-1">{related}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

          </div>
        );
      }

      if (searchError) {
        return (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-medium mb-2">{t('search.searchFailed')}</h3>
            <p className="text-muted-foreground mb-4">{searchError}</p>
            <Button onClick={() => {
              setSearchError(null);
              window.location.reload();
            }} variant="outline">
              {t('search.tryAgain')}
            </Button>
          </div>
        );
      }

      if (query) {
        return (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">{t('search.noResultsQuery', { query })}</h3>
          </div>
        );
      }
      return (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">{t('search.enterSearchTerm')}</h3>
        </div>
      );
    }

    if (searchType === 'images') {
      if (imageLoading) {
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-muted rounded-lg w-full"></div>
                <div className="h-4 bg-muted rounded w-3/4 mt-2"></div>
                <div className="h-3 bg-muted rounded w-1/2 mt-1"></div>
              </div>
            ))}
          </div>
        );
      }

      if (imageResults.length > 0) {
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {imageResults.map((image, index) => (
              <a key={index} href={image.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden blurry-outline">
                <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-muted mb-3">
                  <Image src={image.thumbnail.src} alt={image.title || t('search.imageAlt')} fill unoptimized sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" placeholder="blur" blurDataURL={image.properties.placeholder || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAwIiBoZWlnaHQ9IjUwMCIgdmlld0JveD0iMCAwIDUwMCA1MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zz4="} />
                </div>
                <p className="text-sm font-medium truncate">{image.title || t('search.imageFallback')}</p>
                <p className="text-xs text-muted-foreground truncate">{image.source}</p>
              </a>
            ))}
          </div>
        );
      }

      return <div className="text-center text-muted-foreground">{t('images.noImagesFound', { query })}</div>;
    }

    if (searchType === 'news') {
      if (newsLoading) {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse border border-border rounded-lg overflow-hidden bg-card">
                <div className="w-full h-48 bg-muted"></div>
                <div className="p-4">
                  <div className="h-5 bg-muted rounded w-4/5 mb-2"></div>
                  <div className="h-5 bg-muted rounded w-3/5 mb-4"></div>
                  <div className="h-3 bg-muted rounded w-full mb-2"></div>
                  <div className="h-3 bg-muted rounded w-4/5 mb-4"></div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-muted rounded"></div>
                    <div className="h-3 bg-muted rounded w-20"></div>
                    <div className="h-3 bg-muted rounded w-12"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      }

      if (newsResults.length > 0) {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {newsResults.map((article, index) => (
              <div key={index} className="border border-border rounded-lg overflow-hidden hover:shadow-lg transition-all duration-200 bg-card">
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="block group h-full">
                  <div className="relative w-full h-48 bg-muted">
                    {resolveImageSrc(article.thumbnail) ? (
                      <div className="relative w-full h-full">
                        <Image src={resolveImageSrc(article.thumbnail)!} alt={article.title} fill unoptimized sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-200" onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const placeholder = target.parentElement?.querySelector('.image-placeholder');
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = 'flex';
                          }
                        }} />
                        <div className="image-placeholder w-full h-full flex items-center justify-center bg-muted" style={{ display: 'none' }}>
                          <Newspaper className="w-12 h-12 text-muted-foreground/50" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <Newspaper className="w-12 h-12 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-2">
                      {settings.showFavicons && article.favicon && (
                        <Image src={article.favicon} alt="" width={16} height={16} unoptimized className="w-4 h-4 rounded-sm flex-shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground truncate">
                        {article.source.replace(/^(https?:\/\/)?(www\.)?/, '')}
                        {article.age && (
                          <>
                            <span className="mx-1">•</span>
                            {article.age}
                          </>
                        )}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold group-hover:text-primary transition-colors line-clamp-2 mb-2 leading-tight">{article.title}</h2>
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-2 flex-grow">{(() => {
                      const words = article.description.split(' ');
                      if (words.length <= 14) {
                        return article.description + '...';
                      }
                      return words.slice(0, 14).join(' ') + '...';
                    })()}</p>
                  </div>
                </a>
              </div>
            ))}
          </div>
        );
      }

      return <div className="text-center text-muted-foreground">{t('news.noNewsFound', { query })}</div>;
    }

    if (searchType === 'videos') {
      if (videoLoading) {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse border border-border rounded-lg overflow-hidden bg-card">
                <div className="w-full h-48 bg-muted"></div>
                <div className="p-4">
                  <div className="h-5 bg-muted rounded w-4/5 mb-2"></div>
                  <div className="h-5 bg-muted rounded w-3/5 mb-4"></div>
                  <div className="h-3 bg-muted rounded w-full mb-2"></div>
                </div>
              </div>
            ))}
          </div>
        );
      }

      if (videoResults.length > 0) {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {videoResults.map((v, index) => (
              <a key={index} href={v.url || v.content_url || '#'} target="_blank" rel="noopener noreferrer" className="group overflow-hidden blurry-outline border border-border rounded-lg p-2 bg-card hover:shadow-lg transition-all">
                <div className="relative w-full h-48 bg-muted rounded-md overflow-hidden mb-3">
                  {resolveImageSrc(v.thumbnail) ? (
                    <Image src={resolveImageSrc(v.thumbnail)!} alt={v.title || t('search.videoFallback')} fill unoptimized className="object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Search className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <h4 className="text-base font-semibold line-clamp-2 mb-1 group-hover:text-primary">{v.title || v.name}</h4>
                {v.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{v.description}</p>}
                <div className="text-xs text-muted-foreground">{v.site || v.source || ''}</div>
              </a>
            ))}
          </div>
        );
      }

      return <div className="text-center text-muted-foreground">{t('videos.noVideosFound', { query })}</div>;
    }

    return null;
  };

  return (
    <>
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80"
        style={{
          opacity: scrollProgress,
          transform: `translateY(${(-8) * (1 - scrollProgress)}px)`,
          transition: "opacity 150ms ease-out, transform 150ms ease-out",
          pointerEvents: scrollProgress > 0.1 ? "auto" : "none",
        }}
        aria-hidden={scrollProgress < 0.05}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex w-11 shrink-0 items-center justify-center">
            {logoLoaded ? (
              <Image key={logoMetadata.path} src={logoMetadata.path} alt={t('search.logoAlt')} width={36} height={12} style={{ transform: `scale(1)`, transition: "transform 150ms ease-out" }} suppressHydrationWarning />
            ) : (
              <div style={{ width: 36, height: 12 }} className="bg-transparent" />
            )}
            <span className="sr-only">Tekir</span>
          </Link>

          <form onSubmit={handleSearch} className="relative flex-1 max-w-[42rem]">
            <div className="relative">
              <SearchInput
                type="text"
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setShowSuggestions(true); }}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowSuggestions(true)}
                placeholder={t('search.placeholder')}
                className="h-10 w-full border-input bg-muted/35 pr-12 text-[0.95rem] shadow-sm transition-colors focus-visible:bg-background"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Button type="submit" variant="ghost" size="icon" shape="pill" title="Search">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Autocomplete dropdown tied to the header input */}
            {showSuggestions && suggestions.length > 0 && (
              <div ref={suggestionsRef} className="absolute w-full mt-2 py-2 bg-background rounded-lg border border-border shadow-lg z-50">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.query}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSearchInput(suggestion.query);
                      router.push(`/search?q=${encodeURIComponent(suggestion.query)}`);
                      setShowSuggestions(false);
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-muted transition-colors ${index === selectedIndex ? 'bg-muted' : ''
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-muted-foreground" />
                      <span>{suggestion.query}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </form>

          <div className="ml-auto flex items-center gap-3">
            <UserProfile avatarSize={36} />
          </div>
        </div>
      </header>

      <div className="min-h-screen flex flex-col">
        <main className="flex-grow px-4 pb-8 pt-4 sm:px-6 lg:px-8">
          {/* Flying Cats Easter Egg overlay */}
          <FlyingCats show={!!catEasterEgg} />
          <div className="mx-auto mb-4 w-full max-w-7xl relative">
            <form onSubmit={handleSearch} className="flex h-14 w-full max-w-[54rem] items-center gap-3">
              <Link href="/" className="flex w-11 shrink-0 items-center justify-center">
                {logoLoaded ? (
                  <Image key={logoMetadata.path} src={logoMetadata.path} alt="Tekir Logo" width={40} height={40} priority suppressHydrationWarning />
                ) : (
                  <div style={{ width: 40, height: 40 }} className="bg-transparent" />
                )}
              </Link>
              <div className="relative flex-1 min-w-0">
                <div className="flex items-center w-full relative">
                  <Input
                    type="text"
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder={t('search.placeholder')}
                    maxLength={800}
                    className="h-11 flex-1 rounded-full border-input bg-muted/35 px-4 py-2 pr-14 text-[0.98rem] shadow-sm transition-colors focus-visible:bg-background"
                    style={{ minWidth: 0 }}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <Button type="submit" variant="ghost" size="icon" shape="pill" title="Search">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {showSuggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className={`absolute z-50 w-full ${hasBang ? 'mt-6' : 'mt-2'} overflow-hidden rounded-xl border border-border bg-popover py-1.5 shadow-xl`}
                  >
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.query}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSearchInput(suggestion.query);
                          router.push(`/search?q=${encodeURIComponent(suggestion.query)}`);
                          setShowSuggestions(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted ${index === selectedIndex ? 'bg-muted' : ''
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-muted-foreground" />
                          <span>{suggestion.query}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="ml-auto hidden items-center gap-4 md:flex">
                <UserProfile mobileNavItems={mobileNavItems} />
              </div>
              <div className="md:hidden">
                <UserProfile mobileNavItems={mobileNavItems} />
              </div>
            </form>

          </div>

          <div className="mx-auto w-full max-w-7xl relative">
            {query && (
              <div className="mb-4 max-w-[54rem] border-b border-border">
                <SearchTabs active={searchType} onChange={handleSearchTypeChange} />
              </div>
            )}

            {query && (
              <div className="-mx-4 mb-4 flex max-w-[calc(100vw-1rem)] flex-nowrap items-center gap-1.5 overflow-x-auto px-4 pb-1 text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:mb-5 sm:max-w-[54rem] sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0 sm:text-sm" data-serp-chooser>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={openSerpChooser === 'protected'}
                  onClick={() => setOpenSerpChooser(openSerpChooser === 'protected' ? null : 'protected')}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/25 dark:text-emerald-200 dark:hover:bg-emerald-900/35 sm:mr-1 sm:h-9 sm:gap-2 sm:px-4 sm:text-sm"
                  title="Tekir does not sell your search data."
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Protected
                </button>
                {openSerpChooser === 'protected' && (
                  <div
                    role="dialog"
                    aria-label="Protected search privacy"
                    className="fixed left-3 right-3 top-36 z-[60] rounded-lg border border-emerald-500/25 bg-popover p-4 text-sm shadow-xl sm:absolute sm:left-0 sm:right-auto sm:top-[calc(100%+0.5rem)] sm:w-80"
                  >
                    <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      Protected search
                    </div>
                    <div className="space-y-2 text-muted-foreground">
                      {[
                        "Searches are never saved.",
                        "We do not collect personal search data.",
                        "No search profiling or selling data.",
                      ].map((item) => (
                        <div key={item} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <SerpChooser
                  id="serp-region"
                  label="Region"
                  value={settings.searchCountry || "ALL"}
                  valueLabel={SERP_COUNTRIES.find((country) => country.code === (settings.searchCountry || "ALL"))?.name || "All regions"}
                  options={SERP_COUNTRIES.map((country) => ({ value: country.code, label: country.name }))}
                  open={openSerpChooser === 'region'}
                  onOpenChange={(open) => setOpenSerpChooser(open ? 'region' : null)}
                  onChange={handleSerpCountryChange}
                />

                <SerpChooser
                  id="serp-safe"
                  label="Safe Search"
                  value={settings.safesearch || "moderate"}
                  valueLabel={SAFE_SEARCH_OPTIONS.find((option) => option.value === (settings.safesearch || "moderate"))?.label || "Safe: Moderate"}
                  options={SAFE_SEARCH_OPTIONS}
                  open={openSerpChooser === 'safe'}
                  onOpenChange={(open) => setOpenSerpChooser(open ? 'safe' : null)}
                  onChange={handleSerpSafeSearchChange}
                />

                {searchType === 'web' && (
                  <SerpChooser
                    id="serp-time"
                    label="Time"
                    value={freshnessFilter}
                    valueLabel={FRESHNESS_OPTIONS.find((option) => option.value === freshnessFilter)?.label || "Any time"}
                    options={FRESHNESS_OPTIONS}
                    open={openSerpChooser === 'time'}
                    onOpenChange={(open) => setOpenSerpChooser(open ? 'time' : null)}
                    onChange={handleFreshnessChange}
                  />
                )}

                <SerpChooser
                  id="serp-provider"
                  label="Provider"
                  value={getEngineForMode(searchEngine, searchType)}
                  valueLabel={getEngineForMode(searchEngine, searchType) === 'you' ? 'You.com' : getEngineForMode(searchEngine, searchType) === 'google' ? 'Google' : 'Brave'}
                  options={[
                    { value: 'brave', label: 'Brave' },
                    { value: 'you', label: 'You.com', disabled: searchType !== 'web' },
                    { value: 'google', label: isAuthenticated ? 'Google' : 'Google', disabled: !isAuthenticated },
                  ]}
                  open={openSerpChooser === 'provider'}
                  onOpenChange={(open) => setOpenSerpChooser(open ? 'provider' : null)}
                  onChange={handleSerpProviderChange}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,44rem)_minmax(19rem,22rem)] xl:gap-12">
              <div className="min-w-0">
                {/* Standalone AI/Dive error banner */}
                {(searchType === 'web' && aiEnabled && (aiError || diveError)) ? (
                  <div
                    role="alert"
                    className="mb-4 p-3 rounded-md border border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 text-sm flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{t('search.karakulakError')}</span>
                    <button
                      onClick={() => {
                        setAiError(false);
                        setDiveError(false);
                      }}
                      className="ml-auto text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100"
                      aria-label="Dismiss error"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : null}
                {showKarakulak ? (
                  <section className={`mb-6 overflow-hidden rounded-lg border border-blue-500/20 bg-blue-50/55 shadow-sm dark:bg-blue-950/20 ${aiDiveEnabled ? 'p-4' : 'p-3.5 sm:p-4'}`}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center">
                        <Cat className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span className="ml-2 inline-flex min-w-0 items-center text-sm font-semibold text-blue-900 dark:text-blue-100">
                          {t('search.karakulakName')}
                          <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-normal bg-blue-600 text-white">
                            {t('search.betaLabel')}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleToggleAiDive}
                          className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border text-sm font-medium transition-colors duration-200 ${aiDiveEnabled
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-blue-500/20 bg-background/70 text-blue-700 hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-950/60'
                            }`}
                          title={aiDiveEnabled ? "Disable Dive mode" : "Enable Dive mode"}
                        >
                          <Sparkles className="relative z-10 h-4 w-4" />
                          {aiDiveEnabled && (
                            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 via-blue-300/30 to-blue-400/20 animate-pulse"></div>
                          )}
                        </button>

                        <button
                          onClick={() => setKarakulakCollapsed(prev => !prev)}
                          aria-expanded={!karakulakCollapsed}
                          title={karakulakCollapsed ? 'Expand Karakulak' : 'Collapse Karakulak'}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform ${karakulakCollapsed ? 'rotate-180' : ''}`} />
                          <span className="sr-only">{karakulakCollapsed ? 'Expand' : 'Collapse'}</span>
                        </button>
                      </div>
                    </div>

                    {(aiLoading || diveLoading) ? (
                      <div className="animate-pulse space-y-2">
                        <div className="flex items-center gap-2 text-xs text-blue-600/70 dark:text-blue-300/70">
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                          <span>{aiDiveEnabled ? DIVE_LOADING_MESSAGES[diveLoadingMessageIndex] : t('search.processingRequest')}</span>
                        </div>
                        <div className="h-4 bg-blue-200 dark:bg-blue-700 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-blue-200 dark:bg-blue-700 rounded w-1/2 mb-3"></div>
                      </div>
                    ) : (
                      <>
                        <p className={`text-left text-blue-950 dark:text-blue-100 ${
                          aiDiveEnabled
                            ? `mb-2 text-[0.95rem] leading-6 ${karakulakCollapsed ? 'line-clamp-2' : ''}`
                            : `mb-2 text-[0.98rem] leading-7 ${karakulakCollapsed ? 'line-clamp-2' : 'line-clamp-4'}`
                        }`}>
                          {diveResponse || aiResponse}
                        </p>

                        <div className={`${aiDiveEnabled ? 'mb-3 flex flex-wrap items-center justify-between gap-2' : 'mb-1 flex items-center justify-end gap-1'}`}>
                          {diveSources && diveSources.length > 0 ? (
                            <div className="flex min-w-0 flex-wrap gap-1.5">
                              {diveSources.slice(0, karakulakCollapsed ? 3 : 6).map((source, index) => (
                                <a
                                  key={`assist-source-${index}`}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex max-w-[12rem] items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 transition-colors hover:bg-blue-200 dark:bg-blue-800/50 dark:text-blue-100 dark:hover:bg-blue-800/70"
                                  title={source.description || source.title}
                                >
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">{index + 1}</span>
                                  <span className="truncate">{source.title}</span>
                                </a>
                              ))}
                            </div>
                          ) : null}

                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={copyAnswer}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-blue-800 transition-colors hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-blue-900/50"
                              title="Copy answer"
                            >
                              {answerCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={shareAnswer}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-blue-800 transition-colors hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-blue-900/50"
                              title="Share answer"
                            >
                              <Share2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div
                          className="overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out"
                          style={{ maxHeight: karakulakCollapsed ? 0 : 1000, opacity: karakulakCollapsed ? 0 : 1, transform: karakulakCollapsed ? 'translateY(-6px)' : 'translateY(0px)' }}
                          aria-hidden={karakulakCollapsed}
                        >
                          {(diveResponse || aiResponse) ? (
                            <p className="mb-1 text-xs text-blue-700/70 dark:text-blue-300/70">
                              {aiDiveEnabled
                                ? "Search Assist uses the visible web sources above. Verify important details."
                                : "Auto-generated based on AI knowledge. May contain inaccuracies."
                              }
                            </p>
                          ) : null}

                        </div>
                      </>
                    )}
                  </section>
                ) : null}

                {searchType === 'web' && (
                  <div className="lg:hidden">
                    {wikiLoading ? (
                      <div className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm animate-pulse">
                        <div className="flex items-center mb-3">
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/3"></div>
                        </div>
                        <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
                      </div>
                    ) : wikiData ? (
                      <div className="mb-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                        <button
                          onClick={() => setWikiExpanded(!wikiExpanded)}
                          className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/45"
                        >
                          <div className="flex items-center">
                            <span className="text-sm font-medium">From Wikipedia ({wikiData.language?.toUpperCase() || 'EN'}): {wikiData.title}</span>
                          </div>
                          <ChevronDown className={`w-5 h-5 transition-transform ${wikiExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {wikiExpanded && (
                          <div className="border-t border-border">
                            <WikiNotebook wikiData={wikiData} />
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {renderResultsArea()}
              </div>

              {searchType === 'web' && (
                <aside className="hidden lg:block">
                  {wikiLoading ? (
                    <div className="sticky top-20 rounded-lg border border-border bg-card p-5 shadow-sm animate-pulse">
                      <div className="h-5 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-4"></div>
                      <div className="w-full h-40 bg-gray-200 dark:bg-gray-600 rounded mb-4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-full mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-5/6 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-4/6"></div>
                    </div>
                  ) : wikiData ? (
                    <div className="sticky top-20">
                      <WikiNotebook wikiData={wikiData} />
                    </div>
                  ) : null}
                </aside>
              )}
            </div>
          </div>
        </main>

        <Footer variant="minimal" />
        <FloatingFeedback
          query={query}
          results={results}
          wikiData={wikiData}
          suggestions={suggestions}
          aiResponse={aiResponse || diveResponse}
          searchEngine={searchEngine}
          searchType={searchType}
        />
      </div>
    </>
  );
}

// Create a new default export component that wraps SearchPageContent in Suspense
export default function SearchPage() {
  return (
    <Suspense fallback={<div></div>}>
      <SearchPageContent />
    </Suspense>
  );
}
