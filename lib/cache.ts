interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  provider: string;
  query: string;
  searchParams?: Record<string, string>;
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

interface CacheMetadata {
  provider: string;
  query: string;
  searchParams?: Record<string, string>;
}

// Analytics import (dynamic to avoid SSR issues)
let trackAPIError: ((errorType: string, url: string, statusCode?: number, userAction?: string) => void) | null = null;
let trackClientLog: ((message: string, properties?: Record<string, any>) => void) | null = null;

if (typeof window !== 'undefined') {
  import('@/lib/posthog-analytics').then((module) => {
    trackAPIError = module.trackAPIError;
    trackClientLog = module.trackClientLog;
  }).catch(() => {
    // Module not available, ignore
  });
}

export class SearchCache {
  private static readonly MAX_CACHE_SIZE = 50; // Maximum number of cached entries per type
  private static readonly CACHE_DURATIONS: Record<
    'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia',
    number
  > = {
    search: 10 * 60 * 1000,
    images: 30 * 60 * 1000,
    news: 20 * 60 * 1000,
    videos: 20 * 60 * 1000,
    ai: 10 * 60 * 1000,
    dive: 10 * 60 * 1000,
    wikipedia: 60 * 60 * 1000,
  };

  /**
   * Get cache duration (ms) for the given search type.
   */
  private static getCacheDuration(
    searchType: 'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia'
  ): number {
    return this.CACHE_DURATIONS[searchType] ?? 10 * 60 * 1000;
  }

  /**
   * Generate a cache key based on search type, provider, query, and optional parameters
   */
  private static generateCacheKey(
    searchType: 'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia',
    provider: string,
    query: string,
    searchParams?: Record<string, string>
  ): string {
    const baseKey = `${searchType}-${provider}-${encodeURIComponent(query)}`;

    if (searchParams && Object.keys(searchParams).length > 0) {
      // Sort params for consistent key generation
      const sortedParams = Object.keys(searchParams)
        .sort()
        .map(key => `${key}=${encodeURIComponent(searchParams[key])}`)
        .join('&');
      return `${baseKey}?${sortedParams}`;
    }

    return baseKey;
  }

  /**
   * Clean up expired cache entries and maintain cache size limits
   */
  private static cleanupCache(searchType: 'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia'): void {
    if (typeof window === 'undefined') return;

    try {
      const allKeys = Object.keys(sessionStorage);
      const typeKeys = allKeys.filter(key => key.startsWith(`${searchType}-`));

      // Remove expired entries
      const currentTime = Date.now();
      const cacheDuration = this.getCacheDuration(searchType);
      const validEntries: Array<{ key: string; timestamp: number }> = [];

      typeKeys.forEach(key => {
        try {
          const item = sessionStorage.getItem(key);
          if (item) {
            const parsed: CacheEntry = JSON.parse(item);
            if (currentTime - parsed.timestamp < cacheDuration) {
              validEntries.push({ key, timestamp: parsed.timestamp });
            } else {
              sessionStorage.removeItem(key);
            }
          }
        } catch (error) {
          // Remove corrupted entries
          sessionStorage.removeItem(key);
        }
      });

      // If we still have too many entries, remove the oldest ones
      if (validEntries.length > this.MAX_CACHE_SIZE) {
        validEntries.sort((a, b) => a.timestamp - b.timestamp);
        const entriesToRemove = validEntries.slice(0, validEntries.length - this.MAX_CACHE_SIZE);
        entriesToRemove.forEach(entry => {
          sessionStorage.removeItem(entry.key);
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Error during cache cleanup:', error);
      }
    }
  }

  /**
   * Get cached data for a search request
   */
  static get<T = any>(
    searchType: 'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia',
    provider: string,
    query: string,
    searchParams?: Record<string, string>
  ): T | null {
    if (typeof window === 'undefined') return null;

    try {
      const cacheKey = this.generateCacheKey(searchType, provider, query, searchParams);
      const cachedItem = sessionStorage.getItem(cacheKey);

      if (!cachedItem) return null;

      const parsed: CacheEntry<T> = JSON.parse(cachedItem);
      const currentTime = Date.now();

      // Check if cache is expired
      if (currentTime - parsed.timestamp > this.getCacheDuration(searchType)) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      // Development-only logging without sensitive query data
      if (process.env.NODE_ENV === 'development') {
        trackClientLog?.('cache_hit', {
          search_type: searchType,
          provider,
        });
      }
      return parsed.data;
    } catch (error) {
      // Only log errors in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('Error reading from cache:', error);
      }
      return null;
    }
  }

  /**
   * Set cached data for a search request
   */
  static set<T = any>(
    searchType: 'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia',
    provider: string,
    query: string,
    data: T,
    searchParams?: Record<string, string>
  ): void {
    if (typeof window === 'undefined') return;

    try {
      // Clean up old entries before adding new ones
      this.cleanupCache(searchType);

      const cacheKey = this.generateCacheKey(searchType, provider, query, searchParams);
      const cacheEntry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        provider,
        query,
        searchParams
      };

      sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      // Development-only logging without sensitive query data
      if (process.env.NODE_ENV === 'development') {
        trackClientLog?.('cache_set', {
          search_type: searchType,
          provider,
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Error writing to cache:', error);
      }
      // If we hit storage limits, try to clean up and retry once
      try {
        this.cleanupCache(searchType);
        const cacheKey = this.generateCacheKey(searchType, provider, query, searchParams);
        const cacheEntry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          provider,
          query,
          searchParams
        };
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      } catch (retryError) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to cache after cleanup:', retryError);
        }
      }
    }
  }

  /**
   * Clear all cached data for a specific search type
   */
  static clearType(searchType: 'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia'): void {
    if (typeof window === 'undefined') return;

    try {
      const allKeys = Object.keys(sessionStorage);
      const typeKeys = allKeys.filter(key => key.startsWith(`${searchType}-`));

      typeKeys.forEach(key => {
        sessionStorage.removeItem(key);
      });

      if (process.env.NODE_ENV === 'development') {
        trackClientLog?.('cache_cleared_type', {
          search_type: searchType,
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Error clearing ${searchType} cache:`, error);
      }
    }
  }

  /**
   * Clear all cached search data
   */
  static clearAll(): void {
    if (typeof window === 'undefined') return;

    try {
      const allKeys = Object.keys(sessionStorage);
      const searchKeys = allKeys.filter(key =>
        key.startsWith('search-') ||
        key.startsWith('images-') ||
        key.startsWith('news-') ||
        key.startsWith('ai-') ||
        key.startsWith('dive-') ||
        key.startsWith('videos-') ||
        key.startsWith('wikipedia-') ||
        key.startsWith('autocomplete-')
      );

      searchKeys.forEach(key => {
        sessionStorage.removeItem(key);
      });

      if (process.env.NODE_ENV === 'development') {
        trackClientLog?.('cache_cleared_all');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Error clearing all cache:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  static getStats(): {
    search: number;
    images: number;
    news: number;
    ai: number;
    dive: number;
    videos: number;
    wikipedia: number;
    total: number;
    totalSize: number;
  } {
    if (typeof window === 'undefined') {
      return { search: 0, images: 0, news: 0, ai: 0, dive: 0, videos: 0, wikipedia: 0, total: 0, totalSize: 0 };
    }

    try {
      const allKeys = Object.keys(sessionStorage);
      const searchKeys = allKeys.filter(key => key.startsWith('search-'));
      const imageKeys = allKeys.filter(key => key.startsWith('images-'));
      const newsKeys = allKeys.filter(key => key.startsWith('news-'));
      const aiKeys = allKeys.filter(key => key.startsWith('ai-'));
      const diveKeys = allKeys.filter(key => key.startsWith('dive-'));
      const videoKeys = allKeys.filter(key => key.startsWith('videos-'));
      const wikipediaKeys = allKeys.filter(key => key.startsWith('wikipedia-'));

      // Calculate approximate storage size
      let totalSize = 0;
      [...searchKeys, ...imageKeys, ...newsKeys, ...aiKeys, ...diveKeys, ...videoKeys, ...wikipediaKeys].forEach(key => {
        const item = sessionStorage.getItem(key);
        if (item) {
          totalSize += item.length * 2; // Rough estimate: 2 bytes per character in UTF-16
        }
      });

      return {
        search: searchKeys.length,
        images: imageKeys.length,
        news: newsKeys.length,
        ai: aiKeys.length,
        dive: diveKeys.length,
        videos: videoKeys.length,
        wikipedia: wikipediaKeys.length,
        total: searchKeys.length + imageKeys.length + newsKeys.length + aiKeys.length + diveKeys.length + videoKeys.length + wikipediaKeys.length,
        totalSize
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Error getting cache stats:', error);
      }
      return { search: 0, images: 0, news: 0, ai: 0, dive: 0, videos: 0, wikipedia: 0, total: 0, totalSize: 0 };
    }
  }

  /**
   * Check if a specific cache entry exists and is valid
   */
  static has(
    searchType: 'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia',
    provider: string,
    query: string,
    searchParams?: Record<string, string>
  ): boolean {
    return this.get(searchType, provider, query, searchParams) !== null;
  }

  /**
   * Get cached AI response
   */
  static getAI(model: string, query: string): string | null {
    return this.get('ai', model, query);
  }

  /**
   * Set cached AI response
   */
  static setAI(model: string, query: string, response: string): void {
    this.set('ai', model, query, response);
  }

  /**
   * Get cached Dive AI response
   */
  static getDive(query: string): { response: string; sources: any[] } | null {
    return this.get('dive', 'dive', query);
  }

  /**
   * Set cached Dive AI response
   */
  static setDive(query: string, response: string, sources: any[] = []): void {
    this.set('dive', 'dive', query, { response, sources });
  }

  /**
   * Clear all AI-related cache (both regular AI and Dive)
   */
  static clearAI(): void {
    this.clearType('ai');
    this.clearType('dive');
  }

  /**
   * Get cached Wikipedia data
   */
  static getWikipedia(query: string, language?: string): WikipediaData | null {
    return this.get('wikipedia', 'wikipedia', query, language ? { language } : undefined);
  }

  /**
   * Set cached Wikipedia data
   */
  static setWikipedia(query: string, data: WikipediaData, language?: string): void {
    this.set('wikipedia', 'wikipedia', query, data, language ? { language } : undefined);
  }
}

/**
 * Enhanced fetch function with session refresh and caching
 */
export async function fetchWithSessionRefreshAndCache<T = any>(
  url: RequestInfo | URL,
  options?: RequestInit,
  cacheConfig?: {
    searchType: 'search' | 'images' | 'news' | 'ai' | 'dive' | 'videos' | 'wikipedia';
    provider: string;
    query: string;
    searchParams?: Record<string, string>;
    skipCache?: boolean;
  }
): Promise<Response> {
  // Check cache first if caching is enabled
  if (cacheConfig && !cacheConfig.skipCache) {
    const cachedData = SearchCache.get<T>(
      cacheConfig.searchType,
      cacheConfig.provider,
      cacheConfig.query,
      cacheConfig.searchParams
    );

    if (cachedData) {
      // Return a mock Response with cached data
      return new Response(JSON.stringify(cachedData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT'
        }
      });
    }
  }

  // Original fetchWithSessionRefresh logic
  const originalResponse = await fetch(url, options);

  if ((originalResponse.status === 401 || originalResponse.status === 403) && originalResponse.headers.get("Content-Type")?.includes("application/json")) {
    const responseCloneForErrorCheck = originalResponse.clone();
    try {
      const errorData = await responseCloneForErrorCheck.json();
      if (errorData && (errorData.error === "Invalid or expired session token." || errorData.error === "Session token required")) {
        if (process.env.NODE_ENV === 'development') {
          trackClientLog?.('session_refresh_attempt');
        }

        const registerResponse = await fetch("/api/session/register", {
          method: "POST",
        });

        if (registerResponse.ok) {
          if (process.env.NODE_ENV === 'development') {
            trackClientLog?.('session_refresh_success_retrying');
          }
          const retryResponse = await fetch(url, options);

          // Cache successful response if caching is enabled
          if (cacheConfig && !cacheConfig.skipCache && retryResponse.ok) {
            try {
              const responseClone = retryResponse.clone();
              const data = await responseClone.json();
              SearchCache.set(
                cacheConfig.searchType,
                cacheConfig.provider,
                cacheConfig.query,
                data,
                cacheConfig.searchParams
              );
            } catch (error) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('Error caching response after retry:', error);
              }
            }
          }

          return retryResponse;
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.error("Failed to refresh session. Status:", registerResponse.status);
          }
          return originalResponse;
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn("Error parsing JSON from 403/401 response:", e);
      }
    }
  }

  // Cache successful response if caching is enabled
  if (cacheConfig && !cacheConfig.skipCache && originalResponse.ok) {
    try {
      // We need to read the body to cache it, but we can't read it twice.
      // So we read it, cache it, and then return a new Response with the same body.
      const data = await originalResponse.json();

      SearchCache.set(
        cacheConfig.searchType,
        cacheConfig.provider,
        cacheConfig.query,
        data,
        cacheConfig.searchParams
      );

      // Return a new response with the consumed data
      return new Response(JSON.stringify(data), {
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        headers: originalResponse.headers
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Error caching response:', error);
      }
      // If json parsing failed, we can't cache, but we might have consumed the body.
      // Ideally we should clone before reading if we aren't sure it's JSON,
      // but here we expect JSON. If it fails, we might need to fallback or re-fetch?
      // For safety in this specific utility which expects JSON for caching:
      return originalResponse;
    }
  }

  // Track API errors for failed responses (excluding 401/403 which are handled above)
  if (!originalResponse.ok && trackAPIError) {
    const urlStr = typeof url === 'string' ? url : 'url' in url ? String(url.url) : 'unknown';
    const errorType = originalResponse.status >= 500 ? 'server_error' : 'client_error';
    trackAPIError(errorType, urlStr, originalResponse.status, cacheConfig?.searchType);
  }

  return originalResponse;
}

export default SearchCache;
