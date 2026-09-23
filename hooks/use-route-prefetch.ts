"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// In-memory visited-route cache so navigating back never refetches.
// Next.js App Router already keeps an RSC cache, but this guard lets us
// skip duplicate router.prefetch() calls and lets callers check the cache
// synchronously before showing any placeholder.
const visitedRoutes = new Set<string>();
const prefetchedRoutes = new Set<string>();

export function markRouteVisited(href: string) {
  visitedRoutes.add(href);
}

export function hasVisitedRoute(href: string) {
  return visitedRoutes.has(href);
}

function normalizeHref(href: string): string | null {
  if (!href || href.startsWith("#")) return null;
  // Only prefetch same-origin internal routes.
  if (/^(https?:)?\/\//.test(href)) {
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      return `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }
  if (!href.startsWith("/")) return null;
  return href;
}

/**
 * Prefetch route data on hover/focus, not only on click.
 * Deduplicates prefetches and records visited pages in a cache
 * so back-navigation hits the cache instead of refetching.
 */
export function useRoutePrefetch() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const prefetch = useCallback((rawHref: string) => {
    const href = normalizeHref(rawHref);
    if (!href) return;
    // Cache hit: already visited or already prefetched -> no work.
    if (visitedRoutes.has(href) || prefetchedRoutes.has(href)) return;
    prefetchedRoutes.add(href);
    try {
      routerRef.current.prefetch(href);
    } catch {
      prefetchedRoutes.delete(href);
    }
  }, []);

  // Record the current route as visited so "back" is a cache hit.
  useEffect(() => {
    markRouteVisited(`${window.location.pathname}${window.location.search}`);
  }, []);

  return { prefetch, hasVisitedRoute, markRouteVisited };
}

/**
 * Global delegation: prefetch any internal link on hover, focus, or
 * touch-start. This covers every <Link>/<a> without editing each file,
 * and checks the visited/prefetched cache before doing any work.
 */
export function useGlobalLinkPrefetch() {
  const router = useRouter();

  useEffect(() => {
    const onHoverIn = (e: Event) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = normalizeHref(anchor.getAttribute("href") || "");
      if (!href) return;
      if (visitedRoutes.has(href) || prefetchedRoutes.has(href)) return;
      prefetchedRoutes.add(href);
      try {
        router.prefetch(href);
      } catch {
        prefetchedRoutes.delete(href);
      }
    };

    // mouseover/focusin bubble, so one listener covers the whole app.
    // touchstart covers mobile where hover never fires.
    document.addEventListener("mouseover", onHoverIn, { passive: true });
    document.addEventListener("focusin", onHoverIn, { passive: true });
    document.addEventListener("touchstart", onHoverIn, { passive: true });

    const markVisited = () => {
      markRouteVisited(`${window.location.pathname}${window.location.search}`);
    };
    markVisited();

    return () => {
      document.removeEventListener("mouseover", onHoverIn);
      document.removeEventListener("focusin", onHoverIn);
      document.removeEventListener("touchstart", onHoverIn);
    };
  }, [router]);
}
