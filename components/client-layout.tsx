"use client";

import { ThemeProvider } from "@/components/theme-provider";
import AuthProvider from "@/components/auth-provider";
import I18nProvider from "@/components/i18n-provider";
import { ConvexProvider } from "convex/react";
import convex from "@/lib/convex-proxy";
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { prefetchBangs } from '@/utils/bangs';
import { initGlobalErrorHandlers } from '@/lib/client-error-tracking';
import { Toaster } from "@/components/toaster";
import SunsetBanner from "@/components/sunset-banner";
import { trackClientLog } from "@/lib/posthog-analytics";
import { initClientConsoleForwarding } from "@/lib/console-forwarder-client";
import { trackRouteChange } from "@/instrumentation-client";

// Helper functions for cookie manipulation using document.cookie
const getCookie = (name: string): string | undefined => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
};

const setCookie = (name: string, value: string, days: number) => {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
};

const removeCookie = (name: string) => {
  document.cookie = name + '=; Max-Age=-99999999; path=/';
};

// Function to generate a simple random token (replace with a more robust solution if needed)
const generateSessionToken = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasTrackedRouteChange = useRef(false);

  // Prefetch bangs when the app initializes
  useEffect(() => {
    initClientConsoleForwarding();
    prefetchBangs();
    initGlobalErrorHandlers(); // Initialize global error handlers once
  }, []);

  useEffect(() => {
    const initializeSession = async () => {
      // Check if we've already registered this session in this browser tab to avoid redundant API calls
      if (sessionStorage.getItem('session_registered') === 'true') {
        (window as any).__sessionRegistered = true;
        return;
      }

      let sessionToken = getCookie('session-token');
      if (!sessionToken) {
        sessionToken = generateSessionToken();
        setCookie('session-token', sessionToken, 7); // Expires in 7 days

        if (sessionToken) {
          try {
            const response = await fetch('/api/session/register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token: sessionToken }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
              console.error("Failed to register session token with Convex:", result.error || response.statusText);
              removeCookie('session-token'); // Clear cookie if registration failed
            } else {
              trackClientLog('session_token_registered', {
                has_session_token: Boolean(sessionToken),
              });
              sessionStorage.setItem('session_registered', 'true');
              (window as any).__sessionRegistered = true;
              window.dispatchEvent(new Event('session-registered'));
            }
          } catch (error) {
            console.error("Error calling session registration API:", error);
            removeCookie('session-token'); // Clear cookie on API call error
          }
        }
      } else {
        // If we have a cookie but sessionStorage doesn't know about it, we assume it's valid
        // but mark it as registered to skip future checks in this tab.
        // Ideally we might want to verify it, but for performance we trust the cookie existence.
        trackClientLog('session_token_existing', {
          has_session_token: Boolean(sessionToken),
        });
        sessionStorage.setItem('session_registered', 'true');
        (window as any).__sessionRegistered = true;
        // Dispatch event so AuthProvider can proceed with auth check
        window.dispatchEvent(new Event('session-registered'));
      }
    };
    initializeSession();
  }, []);

  useEffect(() => {
    if (!hasTrackedRouteChange.current) {
      hasTrackedRouteChange.current = true;
      return;
    }

    trackRouteChange(`${window.location.origin}${pathname}${window.location.search}`);
  }, [pathname]);

  return (
    <ConvexProvider client={convex}>
      <AuthProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            {children}
            <SunsetBanner />
          </I18nProvider>
        </ThemeProvider>
      </AuthProvider>
      <Toaster />
    </ConvexProvider>
  );
}
