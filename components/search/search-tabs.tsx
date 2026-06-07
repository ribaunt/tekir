"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, Image as ImageIcon, Newspaper, Video, MoreHorizontal, LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

interface SearchTabsProps {
  active: 'web' | 'images' | 'news' | 'videos';
  onChange: (tab: 'web' | 'images' | 'news' | 'videos') => void;
}

export function SearchTabs({ active, onChange }: SearchTabsProps) {
  const t = useTranslations('search.tabs');

  const TABS: Array<{ key: 'web' | 'images' | 'news' | 'videos'; label: string; Icon: LucideIcon }> = [
    { key: 'web', label: t('web'), Icon: Search },
    { key: 'images', label: t('images'), Icon: ImageIcon },
    { key: 'videos', label: t('videos'), Icon: Video },
    { key: 'news', label: t('news'), Icon: Newspaper },
  ];

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!moreOpen) return;
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) return;
      if (moreRef.current && moreRef.current.contains(e.target as Node)) return;
      setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [moreOpen]);

  // Handle Escape key to close dropdown
  useEffect(() => {
    if (!moreOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [moreOpen]);

  // Desktop / large screens: show full tab list
  const fullTabs = (
    <div className="hidden md:flex items-center gap-1" role="tablist" aria-label="Search result types">
      {TABS.map((t) => {
        const Icon = t.Icon;
        const isActive = active === t.key;
        return (
          <button
            type="button"
            key={t.key}
            onClick={() => onChange(t.key)}
            className="relative flex h-10 items-center gap-1.5 px-3 text-sm transition-colors group"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`} aria-hidden="true" />
              <span className={isActive ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground"}>
                {t.label}
              </span>
            </div>
            <div
              className={`absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary transition-opacity duration-200 ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        );
      })}
    </div>
  );

  const maxVisible = 4; 
  const tabSlots = maxVisible - 1; 
  const visibleTabs = TABS.slice(0, tabSlots);
  const overflowTabs = TABS.filter((t) => !visibleTabs.some((v) => v.key === t.key));

  const moreActive = overflowTabs.some((t) => t.key === active);

  const mobileTabs = (
    <div className="w-full md:hidden flex items-center justify-between overflow-x-auto" role="tablist" aria-label="Search result types">
      <div className="flex items-center gap-1">
        {visibleTabs.map((t) => {
          const Icon = t.Icon;
          const isActive = active === t.key;
          return (
            <button
              type="button"
              key={t.key}
              onClick={() => onChange(t.key)}
              className="relative flex h-10 items-center gap-1.5 px-2.5 text-sm transition-colors group"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`} aria-hidden="true" />
                <span className={isActive ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground"}>
                  {t.label}
                </span>
              </div>
              <div
                className={`absolute bottom-0 left-2.5 right-2.5 h-0.5 rounded-full bg-primary transition-opacity duration-200 ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* More button anchored to the right edge */}
      <div className="relative flex-shrink-0" ref={moreRef}>
        {overflowTabs.length > 0 && (
          <>
            <button
              type="button"
              ref={moreButtonRef}
              onClick={() => setMoreOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-muted/60 ${moreActive ? 'text-foreground' : 'text-muted-foreground'}`}
              aria-label="More search types"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>

            {moreOpen && (
              <div
                ref={popoverRef}
                role="menu"
                aria-label="Additional search types"
                className="absolute right-0 top-full mt-2 w-40 bg-card border border-border rounded-lg shadow-lg z-50"
              >
                <div className="py-1">
                  {overflowTabs.map((t) => {
                    const Icon = t.Icon;
                    const isActive = active === t.key;
                    return (
                      <button
                        type="button"
                        key={`more-${t.key}`}
                        role="menuitem"
                        tabIndex={0}
                        onClick={() => { onChange(t.key); setMoreOpen(false); }}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted ${isActive ? 'text-primary font-medium' : 'text-foreground'}`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {fullTabs}
      {mobileTabs}
    </>
  );
}

export default SearchTabs;
