"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, ExternalLink } from "lucide-react";

type WikiProps = {
  wikiData: any;
};

type FactLink = {
  text: string;
  url?: string;
  wikidataUrl?: string;
};

function formatLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeFactPart(value: any): string | FactLink {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value?.url && typeof value.url === "string") {
    return { text: value.label || value.file || value.url, url: value.url };
  }
  if (value?.wikidataUrl) return { text: value.label || value.id || value.wikidataUrl, wikidataUrl: value.wikidataUrl };
  if (value?.label) return value.label;
  if (value?.id) return value.id;
  return JSON.stringify(value);
}

function FactValue({ value }: { value: string | FactLink }) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="break-words text-blue-600 hover:underline dark:text-blue-400">
          {value}
        </a>
      );
    }

    return <span>{value}</span>;
  }

  const href = value.wikidataUrl || value.url;
  if (!href) return <span>{value.text}</span>;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-blue-600 hover:underline dark:text-blue-400">
      {value.text}
    </a>
  );
}

function renderFact(key: string, value: any) {
  if (value == null) return null;

  const label = formatLabel(key);

  if (key === "coordinates" && value.lat && value.lon) {
    return (
      <div key={key}>
        <span className="font-medium">{label}:</span> {value.lat}, {value.lon}
      </div>
    );
  }

  if (Array.isArray(value)) {
    const parts = value.map(normalizeFactPart).filter(Boolean);
    if (parts.length === 0) return null;

    return (
      <div key={key}>
        <span className="font-medium">{label}:</span>{" "}
        {parts.map((part, index) => (
          <React.Fragment key={`${key}-${index}`}>
            <FactValue value={part} />
            {index < parts.length - 1 ? ", " : ""}
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div key={key}>
        <span className="font-medium">{label}:</span> {value.toLocaleString()}
      </div>
    );
  }

  if (typeof value === "object") {
    if (value.url && typeof value.url === "string") {
      return (
        <div key={key}>
          <span className="font-medium">{label}:</span> <FactValue value={{ text: value.label || value.url, url: value.url }} />
        </div>
      );
    }

    if (value.label || value.id) {
      return (
        <div key={key}>
          <span className="font-medium">{label}:</span> {value.label || value.id}
        </div>
      );
    }

    return (
      <div key={key}>
        <span className="font-medium">{label}:</span> {JSON.stringify(value)}
      </div>
    );
  }

  return (
    <div key={key}>
      <span className="font-medium">{label}:</span> <FactValue value={String(value)} />
    </div>
  );
}

export default function WikiNotebook({ wikiData }: WikiProps) {
  const [expanded, setExpanded] = useState(false);
  const [facts, setFacts] = useState<any | null>(null);
  const [loadingFacts, setLoadingFacts] = useState(false);
  const [factsError, setFactsError] = useState<string | null>(null);

  const pageUrl = wikiData?.content_urls?.desktop?.page || wikiData?.pageUrl || "#";
  const title = wikiData?.title;
  const lang = wikiData?.lang || wikiData?.language || "en";
  const paragraphs = (wikiData?.extract || "").split(/\n{2,}|\r\n{2,}/);
  const first = paragraphs[0] || "";
  const full = wikiData?.extract || "";

  useEffect(() => {
    if (!title) return;

    let mounted = true;
    const fetchFacts = async () => {
      setLoadingFacts(true);
      setFactsError(null);

      try {
        const q = new URL("/api/wikidata", location.href);
        q.searchParams.set("title", title);
        q.searchParams.set("lang", String(lang || "en"));
        const res = await fetch(q.toString());
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (mounted) setFacts(json.facts || null);
      } catch (err: any) {
        if (mounted) setFactsError(err?.message || "failed");
      } finally {
        if (mounted) setLoadingFacts(false);
      }
    };

    fetchFacts();
    return () => {
      mounted = false;
    };
  }, [title, lang]);

  if (!wikiData) return null;

  const visibleFactKeys = facts && typeof facts === "object" ? Object.keys(facts).filter((key) => facts[key] != null) : [];
  const showFacts = loadingFacts || (!factsError && visibleFactKeys.length > 0);

  return (
    <section className="break-words overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm whitespace-normal">
      <div className="p-4 lg:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="mb-1 break-words text-xl font-semibold leading-tight">{wikiData.title}</h3>
            {wikiData.description && <p className="mb-3 text-sm leading-5 text-muted-foreground">{wikiData.description}</p>}
          </div>
          {wikiData.thumbnail && (
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted lg:h-24 lg:w-24">
              <Image src={wikiData.thumbnail.source} alt={wikiData.title} width={96} height={96} unoptimized className="h-full w-full object-cover" />
            </div>
          )}
        </div>

        <div className="mt-3">
          <p className="mb-2 break-words text-sm leading-6 text-foreground/85 whitespace-normal">{expanded ? full : first}</p>
          {full !== first && (
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : "Read more"}
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Open on Wikipedia <ExternalLink className="ml-1 inline-block h-3 w-3" />
          </a>

          {showFacts && (
            <div className="mt-3">
              <h4 className="mb-2 text-sm font-semibold text-foreground">Facts</h4>
              {loadingFacts ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-5/6 rounded bg-muted" />
                </div>
              ) : (
                <div className="space-y-1 break-words text-xs leading-5 text-foreground/80 whitespace-normal">
                  {visibleFactKeys.map((key) => renderFact(key, facts[key]))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
