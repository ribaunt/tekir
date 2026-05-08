import posthog from 'posthog-js';
import { LOCAL_BANGS, type BangsData } from './bangs-data';

let bangsCache: BangsData | null = null;
const BANGS_CACHE_KEY = 'tekir_bangs_cache';
const BANGS_CACHE_EXPIRY_KEY = 'tekir_bangs_cache_expiry';
const CACHE_TTL = 1 * 24 * 60 * 60 * 1000; // 1 day in milliseconds

/**
 * Prefetch the bangs data and store it in memory and localStorage
 * This should be called when the application initializes
 */
export async function prefetchBangs(): Promise<void> {
  // Check if we already have bangs in memory
  if (bangsCache) return;

  bangsCache = LOCAL_BANGS;

  if (typeof window !== 'undefined') {
    localStorage.setItem(BANGS_CACHE_KEY, JSON.stringify(LOCAL_BANGS));
    localStorage.setItem(BANGS_CACHE_EXPIRY_KEY, (Date.now() + CACHE_TTL).toString());
  }
}

/**
 * Refresh the local bangs cache in memory and localStorage.
 */
async function refreshBangsCache(): Promise<void> {
  bangsCache = LOCAL_BANGS;

  if (typeof window !== 'undefined') {
    localStorage.setItem(BANGS_CACHE_KEY, JSON.stringify(LOCAL_BANGS));
    localStorage.setItem(BANGS_CACHE_EXPIRY_KEY, (Date.now() + CACHE_TTL).toString());
  }
}

export async function handleBangRedirect(query: string): Promise<boolean> {
  // Ensure bangs are loaded
  if (!bangsCache) {
    await prefetchBangs();
  }
  
  // Check if it's a pure bang command (starts with !)
  const bangMatch = query.match(/^(![\w]+)(?:\s+(.*))?$/);
  
  // Check if it contains an embedded bang (anywhere in the query)
  const embeddedBangMatch = bangMatch ? null : query.match(/(?:^|\s)(![a-z]+)(?:\s+(.*))?/i);
  
  if (!bangMatch && !embeddedBangMatch) {
    return false; // No bang found
  }
  
  // Use the appropriate match pattern
  const matchToUse = bangMatch || embeddedBangMatch;
  if (!matchToUse) return false;
  
  let bangCommand = matchToUse[1];
  let searchTerms = '';
  
  if (bangMatch) {
    // If it's a pure bang command, the search terms follow the bang
    searchTerms = matchToUse[2] ? matchToUse[2].trim() : '';
  } else if (embeddedBangMatch) {
    // If it's an embedded bang, we use everything except the bang as search terms
    const beforeBang = query.substring(0, query.indexOf(bangCommand)).trim();
    const afterBang = matchToUse[2] ? matchToUse[2].trim() : '';
    searchTerms = (beforeBang + ' ' + afterBang).trim();
  }
  
  // If bangs still aren't loaded (unlikely after the earlier check), try again
  if (!bangsCache) {
    try {
      await refreshBangsCache();
    } catch (err) {
      console.error('Failed to load bangs after retry:', err);
      return false;
    }
  }
  
  // Find matching bang
  const bang = bangsCache ? bangsCache[bangCommand] : undefined;
  
  if (bang) {
    // Capture bang used event in PostHog
    posthog.capture('bang_used', {
      bang_command: bangCommand,
      bang_name: bang.name,
      has_search_terms: searchTerms !== '',
    });

    let redirectUrl: string;
    if (searchTerms === "" && bang.main) {
      // If only a bang command is typed, redirect to the main URL
      redirectUrl = bang.main;
    } else {
      const encodedTerms = encodeURIComponent(searchTerms);
      redirectUrl = bang.url.replace('{search}', encodedTerms);
    }
    
    // Security: Validate redirect URL is safe
    try {
      const url = new URL(redirectUrl);
      // Only allow https: protocol
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        console.error('Unsafe redirect protocol:', url.protocol);
        return false;
      }
      // Additional validation: prevent data:, javascript:, etc.
      const unsafePatterns = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'];
      if (unsafePatterns.some(pattern => redirectUrl.toLowerCase().includes(pattern))) {
        console.error('Unsafe redirect URL detected');
        return false;
      }
      window.location.assign(redirectUrl);
      return true;
    } catch (e) {
      console.error('Invalid redirect URL:', redirectUrl, e);
      return false;
    }
  }
  
  return false; // No matching bang found
}
