"use client";

import React, { useState, memo } from "react";
import Image from "next/image";
import { Globe } from "lucide-react";
import { useSettings } from "@/lib/settings";

export type WebResult = {
  title: string;
  description: string;
  displayUrl: string;
  url: string;
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
};

type Props = {
  result: WebResult;
  priority?: boolean;
};

// Memoized component to prevent unnecessary re-renders
export const WebResultItem = memo(function WebResultItem({ result, priority = false }: Props) {
  const [faviconError, setFaviconError] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const { settings } = useSettings();
  
  // Helper function to clean display URL by removing trailing slashes when appropriate
  const cleanDisplayUrl = (url: string): string => {
    // Remove trailing slash only if it's just a domain/root path
    // Keep trailing slash if there's an actual path after the domain
    if (url.endsWith('/')) {
      // Find the domain part (after protocol)
      const protocolEnd = url.indexOf('//') + 2;
      const domainAndPath = url.substring(protocolEnd);
      
      // Count slashes in the domain+path part
      const slashCount = (domainAndPath.match(/\//g) || []).length;
      
      // If there's only one slash (the trailing one), remove it
      if (slashCount === 1) {
        return url.slice(0, -1);
      }
    }
    return url;
  };
  
  const cleanedDisplayUrl = cleanDisplayUrl(result.displayUrl);
  return (
    <article className="group max-w-[44rem]">
      <div className="mb-1.5 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <a
          href={result.url}
          target="_self"
          rel="noopener noreferrer"
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted transition-colors hover:bg-muted/80"
          title={`Visit ${cleanedDisplayUrl}`}
        >
          {settings.showFavicons && result.favicon && !faviconError ? (
            <Image src={result.favicon} alt="" width={20} height={20} unoptimized className="w-5 h-5 object-contain" onError={() => setFaviconError(true)} />
          ) : (
            <Globe className="w-4 h-4 text-muted-foreground" />
          )}
        </a>
        <a
          href={result.url}
          target="_self"
          rel="noopener noreferrer"
          className="truncate transition-colors hover:text-foreground hover:underline focus:text-foreground focus:underline"
        >
          {cleanedDisplayUrl}
        </a>
        {result.age && (
          <>
            <span className="shrink-0 text-muted-foreground/60">·</span>
            <span className="shrink-0 text-muted-foreground">{result.age}</span>
          </>
        )}
      </div>
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <a
            href={result.url}
            target="_self"
            rel="noopener noreferrer"
            className="block group/title"
          >
            <h2 className="line-clamp-2 text-[1.08rem] font-semibold leading-snug text-foreground transition-colors group-hover:underline group/title-hover:text-primary group/title-focus:text-primary group/title-hover:underline group/title-focus:underline sm:text-[1.18rem]">
              {result.title}
            </h2>
          </a>
          <a
            href={result.url}
            target="_self"
            rel="noopener noreferrer"
            className="mt-1 block break-words text-[0.94rem] leading-6 text-muted-foreground transition-colors line-clamp-3"
          >
            {result.description}
          </a>
        </div>

        {priority && result.thumbnail && !thumbnailError && (
          <a
            href={result.url}
            target="_self"
            rel="noopener noreferrer"
            className="relative mt-1 hidden h-24 w-32 shrink-0 overflow-hidden rounded-md bg-muted sm:block"
            aria-label={result.title}
          >
            <Image
              src={result.thumbnail}
              alt=""
              fill
              unoptimized
              sizes="128px"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
              onError={() => setThumbnailError(true)}
            />
          </a>
        )}
      </div>

      {priority && result.sitelinks && result.sitelinks.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 border-l border-border/70 pl-4 sm:grid-cols-2">
          {result.sitelinks.slice(0, 4).map((link) => (
            <a
              key={`${link.title}-${link.url}`}
              href={link.url}
              target="_self"
              rel="noopener noreferrer"
              className="min-w-0 text-sm leading-snug"
            >
              <span className="block truncate font-medium text-primary hover:underline">{link.title}</span>
              {link.description && (
                <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{link.description}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </article>
  );
});

export default WebResultItem;
