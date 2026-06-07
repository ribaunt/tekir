"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Github, Instagram } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface FooterProps {
  variant?: "full" | "minimal";
  className?: string;
}

function LazyStatusBadge() {
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  useEffect(() => {
    if (hasLoaded) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasLoaded) {
          setIsVisible(true);
          setHasLoaded(true);
        }
      },
      { threshold: 0.1 }
    );
    
    if (iframeRef.current) {
      observer.observe(iframeRef.current);
    }
    
    return () => observer.disconnect();
  }, [hasLoaded]);
  
  return (
    <div
      ref={iframeRef}
      className="rounded max-w-full"
      style={{ width: '250px', height: '30px', overflow: 'hidden' }}
    >
      {isVisible ? (
        <iframe
          src="https://status.tekir.co/en/badge"
          width="250"
          height="30"
          frameBorder="0"
          scrolling="no"
          style={{ colorScheme: 'normal', maxWidth: '100%', width: '100%', height: '30px', display: 'block', border: '0' }}
          className="rounded max-w-full"
          loading="lazy"
        />
      ) : (
        <div
          className="bg-gray-200 dark:bg-gray-700 rounded animate-pulse flex items-center justify-center text-xs text-gray-500 dark:text-gray-400"
          style={{ width: '250px', height: '30px', overflow: 'hidden' }}
        >
          Loading status...
        </div>
      )}
    </div>
  );
}

export default function Footer({ variant = "full", className = "" }: FooterProps) {
  if (variant === "minimal") {
    return (
      <footer className={`w-full py-4 sm:py-6 px-4 sm:px-6 border-t border-border bg-background mt-auto ${className}`}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
              <p className="text-sm text-muted-foreground">
                Tekir, built by{" "}
                <a
                  href="https://ribaunt.com"
                  className="text-primary hover:underline transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ribaunt
                </a>
                .
              </p>
              <div className="flex items-center gap-3 text-sm">
                <Link 
                  href="/privacy" 
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  Privacy
                </Link>
                <Link 
                  href="/terms" 
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  Terms
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <LazyStatusBadge />
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <a
                  href="https://instagram.com/tekirsearch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  aria-label="Follow us on Instagram"
                >
                  <Instagram className="w-5 h-5" />
                </a>
                <a
                  href="https://github.com/computebaker"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  aria-label="View our GitHub"
                >
                  <Github className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`bg-neutral-900 text-neutral-300 w-full ${className}`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-4 sm:gap-x-8 gap-y-8 sm:gap-y-10 mb-8 sm:mb-10">
          {/* Column 1: Logo, Tagline, Discover Button */}
          <div className="lg:col-span-4 text-center sm:text-left">
            <div className="mb-5 flex justify-center sm:justify-start">
              <Image 
                src="/tekir.png" 
                alt="Tekir Logo" 
                width={50} 
                height={150} 
                priority={false}
              />
            </div>
            <p className="text-neutral-400 mb-6 text-sm leading-relaxed">
              Tekir is a privacy-friendly search engine that serves the best search experience. 
            </p>
            <Link
              href="/about"
              className="inline-block px-5 py-2 border border-neutral-600 rounded-md text-sm font-medium text-neutral-200 hover:bg-neutral-800 hover:border-neutral-500 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
            >
              Discover the service
            </Link>
          </div>

          {/* Column 2: Products */}
          <div className="lg:col-span-2 lg:col-start-6 text-center sm:text-left">
            <h3 className="text-base font-semibold text-neutral-100 mb-4">Products</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link 
                  href="/search" 
                  className="text-neutral-400 hover:text-white transition-colors focus:outline-none focus:underline"
                >
                  Search
                </Link>
              </li>
              <li>
                <Link 
                  href="/chat" 
                  className="text-neutral-400 hover:text-white transition-colors focus:outline-none focus:underline"
                >
                  AI Chat
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: About Tekir */}
          <div className="lg:col-span-2 text-center sm:text-left">
            <h3 className="text-base font-semibold text-neutral-100 mb-4">About Tekir</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link 
                  href="/about" 
                  className="text-neutral-400 hover:text-white transition-colors focus:outline-none focus:underline"
                >
                  About us
                </Link>
              </li>
              <li>
                <Link 
                  href="/privacy" 
                  className="text-neutral-400 hover:text-white transition-colors focus:outline-none focus:underline"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link 
                  href="/terms" 
                  className="text-neutral-400 hover:text-white transition-colors focus:outline-none focus:underline"
                >
                  Terms
                </Link>
              </li>
              <li>
                <a 
                  href="https://ribaunt.com" 
                  className="text-neutral-400 hover:text-white transition-colors focus:outline-none focus:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ribaunt
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Follow us */}
          <div className="lg:col-span-2 text-center sm:text-left">
            <h3 className="text-base font-semibold text-neutral-100 mb-4">Follow us</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a 
                  href="https://instagram.com/tekirsearch" 
                  className="text-neutral-400 hover:text-white transition-colors focus:outline-none focus:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram
                </a>
              </li>
              <li>
                <a 
                  href="https://bsky.app/profile/tekir.co" 
                  className="text-neutral-400 hover:text-white transition-colors focus:outline-none focus:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Bluesky
                </a>
              </li>
            </ul>
          </div>
        </div>

        <hr className="border-neutral-800" />

        <div className="flex flex-col lg:flex-row justify-between items-center text-sm text-neutral-500 pt-6 sm:pt-8 gap-4 lg:gap-6">
          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-2 sm:gap-3 lg:gap-5 text-xs sm:text-sm text-center lg:text-left">
            <span>
              &copy; {new Date().getFullYear()}{" "}
              <a 
                href="https://ribaunt.com"
                className="hover:text-neutral-300 transition-colors focus:outline-none focus:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ribaunt
              </a>
              . All rights reserved.
            </span>
            <div className="flex items-center gap-3 lg:gap-5">
              <Link 
                href="/privacy" 
                className="hover:text-neutral-300 transition-colors focus:outline-none focus:underline"
              >
                Privacy
              </Link>
              <Link 
                href="/terms" 
                className="hover:text-neutral-300 transition-colors whitespace-nowrap focus:outline-none focus:underline"
              >
                Terms of Service
              </Link>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full lg:w-auto">
            <LazyStatusBadge />
            <Link
              href="https://btt.community/t/tekir-meta-arama-motoru/18108"
              className="shrink-0 px-3 py-2 border border-neutral-700 rounded-md text-sm font-medium text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600 transition-colors text-center focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="hidden sm:inline">Share your feedback</span>
              <span className="sm:hidden">Feedback</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
