import { useState, useEffect, useMemo } from 'react';
import { fetchWithSessionRefreshAndCache } from "@/lib/cache";
import { trackClientLog } from '@/lib/posthog-analytics';

export interface Suggestion {
    query: string;
    type?: 'autocomplete' | 'recommendation';
}

async function fetchWithSessionRefresh(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
    const originalResponse = await fetch(url, options);

    if ((originalResponse.status === 401 || originalResponse.status === 403) && originalResponse.headers.get("Content-Type")?.includes("application/json")) {
        const responseCloneForErrorCheck = originalResponse.clone();
        try {
            const errorData = await responseCloneForErrorCheck.json();
            if (errorData && (errorData.error === "Invalid or expired session token." || errorData.error === "Session token required")) {
                trackClientLog('session_token_invalid_refresh_attempt');
                const registerResponse = await fetch("/api/session/register", { method: "POST" });
                if (registerResponse.ok) {
                    trackClientLog('session_refresh_success_retrying');
                    return await fetch(url, options);
                } else {
                    console.error("Failed to refresh session. Status:", registerResponse.status);
                    return originalResponse;
                }
            }
        } catch (e) {
            console.warn("Error parsing JSON from 403/401 response, or not the specific session token error:", e);
        }
    }
    return originalResponse;
}

export function useSearchSuggestions(
    searchQuery: string,
    autocompleteSource: string,
    effectiveShowRecs: boolean | null
) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [recs, setRecs] = useState<string[]>([]);
    const [recLoading, setRecLoading] = useState(false);
    const [recIndex, setRecIndex] = useState(0);
    const [recSwitching, setRecSwitching] = useState(false);
    const recommendationWindowSize = 4;

    const isBlankQuery = searchQuery.trim().length === 0;
    const canShowRecommendations = effectiveShowRecs === true && isBlankQuery;

    // Fetch daily recommendations in background on page load
    useEffect(() => {
        let active = true;
        const run = async () => {
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

            setRecLoading(true);
            try {
                const res = await fetchWithSessionRefreshAndCache<{ results: string[]; date?: string; dateLabel?: string }>(
                    "/api/recommend",
                    { method: "GET", headers: { "Content-Type": "application/json" } },
                    { searchType: "ai", provider: "recommend", query: "today" }
                );
                if (!active) return;
                if (res.ok) {
                    const data = await res.json();
                    const items = Array.isArray(data?.results) ? data.results.filter((s: any) => typeof s === "string" && s.trim()) : [];
                    if (items.length > 0) {
                        setRecs(items);
                        setRecIndex(0);
                    } else {
                        setRecs([]);
                    }
                }
            } catch (e) {
                console.warn("[Recommendations] Failed to load recommendations", e);
            } finally {
                if (active) setRecLoading(false);
            }
        };
        run();
        return () => {
            active = false;
        };
    }, []);

    // Fetch autocomplete suggestions
    useEffect(() => {
        let isMounted = true;

        const fetchSuggestions = async () => {
            if (!isMounted) return;

            if (isBlankQuery) {
                // Don't set suggestions here; let recommendationSuggestions handle windowing below
                if (isMounted) setSuggestions([]);
                return;
            }

            if (!isBlankQuery && searchQuery.trim().length < 2) {
                if (isMounted) setSuggestions([]);
                return;
            }

            const country = (typeof window !== 'undefined' && localStorage.getItem('searchCountry')) || 'ALL';
            const safesearch = (typeof window !== 'undefined' && localStorage.getItem('safesearch')) || 'moderate';
            const lang = (typeof window !== 'undefined' && (localStorage.getItem('language') || navigator.language?.slice(0, 2))) || '';
            const baseKey = `autocomplete-${autocompleteSource}-${searchQuery.trim().toLowerCase()}`;
            const _paramsForKey = new URLSearchParams();
            _paramsForKey.set('country', country);
            if (lang) _paramsForKey.set('lang', lang);
            _paramsForKey.set('safesearch', safesearch);
            const cacheKey = `${baseKey}?${_paramsForKey.toString()}`;
            const cached = sessionStorage.getItem(cacheKey);
            if (!(window as any).__autocompleteRetryMap) (window as any).__autocompleteRetryMap = {};
            const retryMap: Record<string, boolean> = (window as any).__autocompleteRetryMap;

            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        if (isMounted) setSuggestions(parsed);
                        return;
                    }
                    if (Array.isArray(parsed) && parsed.length === 0 && retryMap[cacheKey]) {
                        if (isMounted) setSuggestions([]);
                        return;
                    }
                } catch (e) {
                    // fall through to fetch
                }
            }

            try {
                const fetchSuggestionsForLang = async (langParam?: string) => {
                    const params = new URLSearchParams();
                    params.set('q', searchQuery);
                    params.set('country', country);
                    if (langParam) params.set('lang', langParam);
                    params.set('safesearch', safesearch);
                    const response = await fetchWithSessionRefresh(`/api/autocomplete/${autocompleteSource}?${params.toString()}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`Autocomplete fetch failed with status ${response.status}`);
                    }
                    const data = await response.json();

                    if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
                        return data[1].slice(0, 5).map((suggestion: string) => ({ query: suggestion, type: 'autocomplete' as const }));
                    }
                    return [] as Suggestion[];
                };

                let processedSuggestions: Suggestion[] = [];

                try {
                    processedSuggestions = await fetchSuggestionsForLang(lang || undefined);
                } catch (primaryError) {
                    console.error('Failed to fetch suggestions for current language:', primaryError);
                }

                if (processedSuggestions.length === 0 && lang && lang.toLowerCase() !== 'en') {
                    try {
                        const fallbackSuggestions = await fetchSuggestionsForLang('en');
                        if (fallbackSuggestions.length > 0) {
                            processedSuggestions = fallbackSuggestions;
                        }
                    } catch (fallbackError) {
                        console.error('Fallback autocomplete fetch failed:', fallbackError);
                    }
                }

                if (isMounted) setSuggestions(processedSuggestions);
                sessionStorage.setItem(cacheKey, JSON.stringify(processedSuggestions));

                if (processedSuggestions.length === 0) {
                    retryMap[cacheKey] = true;
                } else if (retryMap[cacheKey]) {
                    delete retryMap[cacheKey];
                }
            } catch (error) {
                console.error('Failed to fetch suggestions:', error);
                if (isMounted) setSuggestions([]);
            }
        };

        const delay = isBlankQuery ? 0 : 200;
        const timeoutId = setTimeout(fetchSuggestions, delay);

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [searchQuery, autocompleteSource, effectiveShowRecs, recs, isBlankQuery]);

    const recommendationSuggestions = useMemo(() => {
        if (!canShowRecommendations || recs.length === 0) return [] as Suggestion[];
        const size = Math.min(recommendationWindowSize, recs.length);
        const items: Suggestion[] = [];
        for (let i = 0; i < size; i++) {
            const query = recs[(recIndex + i) % recs.length];
            items.push({ query, type: "recommendation" });
        }
        return items;
    }, [canShowRecommendations, recs, recIndex, recommendationWindowSize]);

    const visibleSuggestions = canShowRecommendations ? recommendationSuggestions : suggestions;

    return {
        suggestions: visibleSuggestions,
        recs,
        recLoading,
        recIndex,
        setRecIndex,
        recSwitching,
        setRecSwitching,
        canShowRecommendations,
        recommendationWindowSize
    };
}
