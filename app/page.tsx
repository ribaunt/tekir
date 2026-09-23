"use client";

import { useEffect, useState, useRef, useTransition, useMemo, useCallback, useLayoutEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth-provider";
import { useSettings } from "@/lib/settings";
import { useSearchSuggestions, Suggestion } from "@/hooks/use-search-suggestions";
import { cn } from "@/lib/utils";
import { Search, MessageCircleMore, RefreshCw } from "lucide-react";

const UserProfile = dynamic(() => import("@/components/user-profile"), { ssr: false });
const WeatherWidget = dynamic(() => import("@/components/weather-widget"), { ssr: false });
const MainFooter = dynamic(() => import("@/components/main-footer"));
const HeroSection = dynamic(
  () => import("@/components/home/hero-section").then((mod) => mod.HeroSection),
  { ssr: false }
);

export default function Home() {
  const tHome = useTranslations("home");
  const tSearch = useTranslations("search");
  const { user } = useAuth();
  const { settings, isInitialized } = useSettings();
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Mobile keyboard awareness
  const [isMobile, setIsMobile] = useState(false);
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  const [kbVisible, setKbVisible] = useState(false);
  const [isHeroInputFocused, setIsHeroInputFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const router = useRouter();
  const startTransition = useTransition()[1];
  const [autocompleteSource] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('autocompleteSource') || 'brave' : 'brave'
  );

  const hasBang = useMemo(() => /(?:^|\s)![a-z]+/.test(searchQuery.toLowerCase()), [searchQuery]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const heroFormRef = useRef<HTMLFormElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const lastSearchAtRef = useRef(0);

  // Lock raised state while submitting so it doesn't animate back before redirect
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Focus lock on mobile: keep input focused until back/outside tap
  const [isFocusLocked, setIsFocusLocked] = useState(false);
  const unlockingRef = useRef(false);
  const pushedStateRef = useRef(false);
  const [dropdownMetrics, setDropdownMetrics] = useState<{ top: number; left: number; width: number } | null>(null);
  const dropdownTrackRafRef = useRef<number | null>(null);

  // Logo chooser state - load from localStorage on mount
  const [selectedLogoState, setSelectedLogoState] = useState<'tekir' | 'duman' | 'pamuk' | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const updateDropdownMetrics = useCallback(() => {
    if (!heroFormRef.current || !mainRef.current) return;
    const heroRect = heroFormRef.current.getBoundingClientRect();
    const mainRect = mainRef.current.getBoundingClientRect();
    // On mobile we want the dropdown to sit directly below the search bar
    const mobileOffset = 10; // touch the search bar on mobile
    const desktopOffset = 12;
    const offset = isMobile ? mobileOffset : desktopOffset;
    setDropdownMetrics({
      top: heroRect.bottom - mainRect.top + offset,
      left: Math.max(8, heroRect.left - mainRect.left),
      width: Math.max(280, heroRect.width),
    });
  }, [isMobile]);

  // Tri-state: null = unknown (no explicit local value) | true | false
  const [localShowRecs, setLocalShowRecs] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('showRecommendations');
      if (stored === null) return null;
      return stored === 'true';
    }
    return null;
  });

  // Determine effective preference
  const effectiveShowRecs: boolean | null = localShowRecs !== null ? localShowRecs : (isInitialized ? (settings.showRecommendations ?? false) : null);

  const closeSuggestionsAndInput = useCallback((blurInput: boolean) => {
    if (showSuggestions) {
      setShowSuggestions(false);
    }
    if (blurInput && isHeroInputFocused) {
      setIsHeroInputFocused(false);
      try { searchInputRef.current?.blur(); } catch { }
    }
  }, [isHeroInputFocused, showSuggestions]);

  // Use custom hook for suggestions
  const {
    suggestions,
    recs,
    recLoading,
    recIndex,
    setRecIndex,
    recSwitching,
    setRecSwitching,
    canShowRecommendations,
    recommendationWindowSize
  } = useSearchSuggestions(searchQuery, autocompleteSource, effectiveShowRecs);

  // Load logo from localStorage on mount (client-side only)
  useEffect(() => {
    const stored = localStorage.getItem('selectedLogo');
    if (stored === 'tekir' || stored === 'duman' || stored === 'pamuk') {
      setSelectedLogoState(stored);
    } else {
      setSelectedLogoState('tekir');
    }
    setLogoLoaded(true);
  }, []);

  // Update logo state when settings change
  useEffect(() => {
    if (settings.selectedLogo && settings.selectedLogo !== selectedLogoState) {
      setSelectedLogoState(settings.selectedLogo);
      localStorage.setItem('selectedLogo', settings.selectedLogo);
    }
  }, [settings.selectedLogo, selectedLogoState]);

  // Placeholder for handleBangRedirect
  const handleBangRedirect = async (query: string): Promise<boolean> => {
    if (query.startsWith("!g ")) {
      const searchTerms = query.substring(3);
      // Validate search terms to prevent injection
      const sanitizedTerms = searchTerms.replace(/[<>\"'\\]/g, '');
      const redirectUrl = `https://google.com/search?q=${encodeURIComponent(sanitizedTerms)}`;
      // Validate the redirect URL is https and well-formed
      try {
        const url = new URL(redirectUrl);
        if (url.protocol === 'https:') {
          window.location.assign(redirectUrl);
          return true;
        }
      } catch {
        // Invalid URL, ignore redirect
      }
    }
    return false;
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("karakulakEnabled");
      if (stored == null) {
        localStorage.setItem("karakulakEnabled", "true");
      }
    }
  }, []);

  // Sync local state when settings are initialized from server
  useEffect(() => {
    if (isInitialized) {
      const serverValue = settings.showRecommendations ?? false;
      setLocalShowRecs(serverValue);
      try {
        if (localStorage.getItem('showRecommendations') === null) {
          localStorage.setItem('showRecommendations', String(serverValue));
        }
      } catch (e) {
        // ignore
      }
    }
  }, [isInitialized, settings.showRecommendations]);

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

  // When focus is locked on mobile, use history entry so Back unlocks instead of leaving immediately
  useEffect(() => {
    const onPopState = (_e: PopStateEvent) => {
      if (!isMobile) return;
      if (isFocusLocked) {
        unlockingRef.current = true;
        setIsFocusLocked(false);
        setIsHeroInputFocused(false);
        try { searchInputRef.current?.blur(); } catch { }
        window.setTimeout(() => { unlockingRef.current = false; }, 80);
        pushedStateRef.current = false;
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isMobile, isFocusLocked]);

  useEffect(() => {
    const handler = (ev: Event) => {
      if (!isMobile) return;
      const target = ev.target as Node | null;
      const insideSuggestions = suggestionsRef.current?.contains(target as Node) ?? false;
      const insideForm = heroFormRef.current?.contains(target as Node) ?? false;

      if (!insideForm && !insideSuggestions) {
        if (isFocusLocked) {
          unlockingRef.current = true;
          setIsFocusLocked(false);
          setIsHeroInputFocused(false);
          if (pushedStateRef.current) {
            try { history.back(); } catch { }
            pushedStateRef.current = false;
          }
          window.setTimeout(() => {
            try { searchInputRef.current?.blur(); } catch { }
            window.setTimeout(() => { unlockingRef.current = false; }, 80);
          }, 10);
        } else if (isHeroInputFocused) {
          setIsHeroInputFocused(false);
          try { searchInputRef.current?.blur(); } catch { }
        }

        closeSuggestionsAndInput(true);
      }
    };
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('touchstart', handler as any);
      document.removeEventListener('mousedown', handler as any);
    };
  }, [isMobile, isFocusLocked, isHeroInputFocused, showSuggestions, closeSuggestionsAndInput]);

  // Track mobile viewport and virtual keyboard visibility
  useEffect(() => {
    const updateIsMobile = () => setIsMobile(window.innerWidth < 768);
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile, { passive: true });

    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const handleVV = () => {
      if (!vv) return;
      const h = Math.round(vv.height);
      setVvHeight(h);
      const reduced = (window.innerHeight || h) - h;
      setKbVisible(reduced > 120);
    };
    if (vv) {
      vv.addEventListener("resize", handleVV);
      vv.addEventListener("scroll", handleVV);
      handleVV();
    }
    return () => {
      window.removeEventListener("resize", updateIsMobile as any);
      if (vv) {
        vv.removeEventListener("resize", handleVV);
        vv.removeEventListener("scroll", handleVV);
      }
    };
  }, []);

  const handleRefreshRecommendations = useCallback(() => {
    if (!canShowRecommendations || recs.length === 0 || recSwitching) return;
    setRecSwitching(true);
    window.setTimeout(() => {
      setRecIndex((prev) => (recs.length ? (prev + recommendationWindowSize) % recs.length : 0));
      setSelectedIndex(-1);
      setRecSwitching(false);
    }, 200);
  }, [
    canShowRecommendations,
    recs.length,
    recSwitching,
    recommendationWindowSize,
    setRecIndex,
    setRecSwitching,
    setSelectedIndex,
  ]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (now - lastSearchAtRef.current < 800) return;
    lastSearchAtRef.current = now;

    if (isMobile && isHeroInputFocused) setIsSubmitting(true);
    const isBangRedirected = await handleBangRedirect(trimmed);
    if (isBangRedirected) {
      return;
    }

    const params = new URLSearchParams();
    params.set("q", trimmed);

    let targetPath = "/search";

    startTransition(() => {
      setTimeout(() => {
        router.replace(`${targetPath}?${params.toString()}`);
        setTimeout(() => setIsSubmitting(false), 1000);
      }, 100);
    });
  };

  const dropdownActive = (showSuggestions || (isHeroInputFocused && searchQuery.trim().length === 0)) && !isSubmitting;
  const shouldRenderDropdown = dropdownActive && (
    suggestions.length > 0 ||
    (canShowRecommendations && (recLoading || recs.length > 0))
  );
  const keyboardAware = isMobile && (isHeroInputFocused || kbVisible || isSubmitting);

  const startDropdownTracking = useCallback((durationMs = 360) => {
    if (!shouldRenderDropdown) return;
    if (dropdownTrackRafRef.current) {
      cancelAnimationFrame(dropdownTrackRafRef.current);
    }
    const endAt = performance.now() + durationMs;
    const tick = () => {
      updateDropdownMetrics();
      if (performance.now() < endAt) {
        dropdownTrackRafRef.current = requestAnimationFrame(tick);
      } else {
        dropdownTrackRafRef.current = null;
      }
    };
    dropdownTrackRafRef.current = requestAnimationFrame(tick);
  }, [shouldRenderDropdown, updateDropdownMetrics]);

  useLayoutEffect(() => {
    if (!shouldRenderDropdown) return;
    updateDropdownMetrics();
    startDropdownTracking();
    return () => {
      if (dropdownTrackRafRef.current) {
        cancelAnimationFrame(dropdownTrackRafRef.current);
        dropdownTrackRafRef.current = null;
      }
    };
  }, [
    keyboardAware,
    isMobile,
    scrollProgress,
    shouldRenderDropdown,
    updateDropdownMetrics,
    vvHeight,
    kbVisible,
    isHeroInputFocused,
    showSuggestions,
    startDropdownTracking,
  ]);

  useEffect(() => {
    if (!shouldRenderDropdown) return;
    const handleResize = () => updateDropdownMetrics();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [shouldRenderDropdown, updateDropdownMetrics]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!shouldRenderDropdown || suggestions.length === 0) return;

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
          setSearchQuery(selected.query);
          setShowSuggestions(false);

          if (isMobile && isFocusLocked) {
            unlockingRef.current = true;
            setIsFocusLocked(false);
            setIsHeroInputFocused(false);
            if (pushedStateRef.current) {
              pushedStateRef.current = false;
            }
            setTimeout(() => { unlockingRef.current = false; }, 80);
          }

          router.push(`/search?q=${encodeURIComponent(selected.query)}`);
        } else {
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  const handleSuggestionClick = useCallback((suggestion: Suggestion) => {
    setSearchQuery(suggestion.query);
    setShowSuggestions(false);

    if (isMobile && isFocusLocked) {
      unlockingRef.current = true;
      setIsFocusLocked(false);
      setIsHeroInputFocused(false);
      if (pushedStateRef.current) {
        pushedStateRef.current = false;
      }
      setTimeout(() => {
        unlockingRef.current = false;
      }, 80);
    }

    router.push(`/search?q=${encodeURIComponent(suggestion.query)}`);
  }, [isFocusLocked, isMobile, router, setIsFocusLocked, setIsHeroInputFocused, setSearchQuery, setShowSuggestions]);

  // Set the document title for the homepage
  useEffect(() => {
    document.title = tHome("metaTitle");
  }, [tHome]);

  // Click outside handler + global keydown listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideSuggestions = suggestionsRef.current?.contains(target);
      const clickedInsideInput = searchInputRef.current?.contains(target);
      const clickedInsideForm = heroFormRef.current?.contains(target);

      if (!clickedInsideSuggestions && !clickedInsideInput && !clickedInsideForm) {
        closeSuggestionsAndInput(true);
      }
    };

    const handleGlobalKeydown = (ev: KeyboardEvent) => {
      if (document.activeElement === searchInputRef.current) return;
      if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Tab', 'Escape'].includes(ev.key)) {
        return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) {
        return;
      }
      const isAlphanumeric = /^[a-zA-Z0-9]$/.test(ev.key);
      if (!isAlphanumeric) return;

      if ((window.scrollY || 0) > 0) {
        const ua = navigator.userAgent || "";
        const isApple = /iPhone|iPad|iPod|Mac/.test(ua);
        if (!isApple) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }

      try {
        (searchInputRef.current as any)?.focus({ preventScroll: true });
      } catch {
        searchInputRef.current?.focus();
      }

      setSearchQuery(prev => prev + ev.key);
      ev.preventDefault();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  }, [closeSuggestionsAndInput]);

  useEffect(() => {
    if (!isHeroInputFocused || !canShowRecommendations) return;
    if (showSuggestions) return;
    if (!recLoading && recs.length === 0) return;
    setShowSuggestions(true);
  }, [isHeroInputFocused, canShowRecommendations, showSuggestions, recLoading, recs.length]);

  return (
    <main id="main-content" ref={mainRef} className="h-[100dvh] relative overflow-x-hidden overflow-hidden overscroll-none">
      {/* Top Right Welcome + Profile (only when not scrolled) */}
      <div
        className="fixed top-4 right-4 z-50"
        style={{
          opacity: keyboardAware ? 0 : (1 - scrollProgress),
          transform: `translateY(${-6 * scrollProgress}px) scale(${1 - 0.08 * scrollProgress})`,
          transition: "opacity 150ms ease-out, transform 150ms ease-out",
          pointerEvents: (scrollProgress > 0.4 || keyboardAware) ? "none" : "auto",
        }}
        aria-hidden={scrollProgress > 0.9}
        tabIndex={scrollProgress > 0.9 ? -1 : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            {user && (
              <div className="text-sm text-muted-foreground">
                {tHome("welcomePrefix")} <span className="font-semibold text-foreground">{user.name || tHome("defaultUser")}</span>!
              </div>
            )}
            {(settings.weatherPlacement || 'topRight') === 'topRight' && (
              <div className="text-right">
                <WeatherWidget size="sm" />
              </div>
            )}
          </div>
          <UserProfile showOnlyAvatar={true} avatarSize={48} />
        </div>
      </div>

      <HeroSection
        keyboardAware={keyboardAware}
        vvHeight={vvHeight}
        logoLoaded={logoLoaded}
        selectedLogoState={selectedLogoState}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        setShowSuggestions={setShowSuggestions}
        handleKeyDown={handleKeyDown}
        handleSearch={handleSearch}
        isHeroInputFocused={isHeroInputFocused}
        setIsHeroInputFocused={setIsHeroInputFocused}
        isMobile={isMobile}
        isFocusLocked={isFocusLocked}
        setIsFocusLocked={setIsFocusLocked}
        isSubmitting={isSubmitting}
        setSelectedIndex={setSelectedIndex}
        suggestionsRef={suggestionsRef}
        heroFormRef={heroFormRef}
        searchInputRef={searchInputRef}
        unlockingRef={unlockingRef}
        pushedStateRef={pushedStateRef}
        hasBang={hasBang}
        isDropdownOpen={shouldRenderDropdown}
      />

      {/* Suggestions Dropdown */}
      {shouldRenderDropdown && (
        <div
          ref={suggestionsRef}
          id="home-suggestions"
          role="listbox"
          aria-label={tSearch("relatedSearches")}
          className={cn(
            "absolute w-full max-w-3xl bg-card/85 backdrop-blur-xl border border-border/50 shadow-2xl z-40 ring-1 ring-black/5 dark:ring-white/10",
            isMobile ? "rounded-3xl px-1.5 py-1.5" : "rounded-2xl overflow-hidden",
            !dropdownMetrics && "left-1/2 -translate-x-1/2",
            // Fallback position when metrics not yet computed - use closer top value on mobile when focused
            !dropdownMetrics && (isMobile ? "top-[100px]" : (keyboardAware ? "top-[140px]" : "top-[calc(50vh+40px)] sm:top-[calc(50vh+60px)]"))
          )}
          style={dropdownMetrics ? { top: dropdownMetrics.top, left: dropdownMetrics.left, width: dropdownMetrics.width } : undefined}
          data-mobile={isMobile}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        >
          {/* Recommendations Header */}
          {canShowRecommendations && (
            <div
              className={cn(
                "flex items-center justify-between border-border/40",
                isMobile ? "px-3 py-2 rounded-2xl border border-border/60 bg-background/80 shadow-sm" : "px-4 py-2 bg-muted/30 border-b"
              )}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="flex flex-col gap-0.5 text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5 text-foreground">
                  <MessageCircleMore className="w-3.5 h-3.5" />
                  {tHome("recommendations.title")}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRefreshRecommendations();
                }}
                disabled={recSwitching}
                className="p-1.5 hover:bg-background/50 rounded-full transition-colors text-muted-foreground hover:text-primary disabled:opacity-50"
                title={tHome("recommendations.refresh")}
              >
                <RefreshCw className={cn("w-3.5 h-3.5", recSwitching && "opacity-50")} />
              </button>
            </div>
          )}

          <div
            className={cn(
              "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
              isMobile ? "flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto px-1.5 pb-1.5 pt-0.5" : "max-h-[40vh] overflow-y-auto py-1.5"
            )}
          >
            {suggestions.map((suggestion, index) => (
              <button
                type="button"
                key={`${suggestion.query}-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSuggestionClick(suggestion);
                }}
                className={cn(
                  "w-full text-left transition-colors",
                  isMobile
                    ? "flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/80 px-2.5 py-2 shadow-sm"
                    : "flex items-center gap-3 px-4 py-3",
                  index === selectedIndex && !isMobile
                    ? "bg-accent/50 text-accent-foreground"
                    : "hover:bg-accent/30 text-foreground/90"
                )}
              >
                {isMobile ? (
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
                      suggestion.type === "recommendation"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/60 text-muted-foreground"
                    )}
                  >
                    <Search className="w-3 h-3" />
                  </div>
                ) : suggestion.type === 'recommendation' ? (
                  <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Search className="w-3 h-3 text-primary" />
                  </div>
                ) : (
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className={cn("font-medium", isMobile ? "text-sm leading-tight" : "truncate")}>{suggestion.query}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <MainFooter />
    </main>
  );
}
