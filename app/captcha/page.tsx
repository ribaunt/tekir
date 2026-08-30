'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import posthog from 'posthog-js';
import RibauntWidget, { type RibauntWidgetHandle } from 'ribaunt/widget-react';

export default function CaptchaPage() {
  const hasTrackedWidgetLoadedRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const widgetRef = useRef<RibauntWidgetHandle>(null);
  const [heading, setHeading] = useState('Let\'s verify you before proceeding.');
  const [returnUrl, setReturnUrl] = useState('/');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resourceProofReady, setResourceProofReady] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [hostname, setHostname] = useState('localhost:3000');
  const [currentDate, setCurrentDate] = useState('');
  const [mounted, setMounted] = useState(false);
  const [widgetStatus, setWidgetStatus] = useState<'loading' | 'ready' | 'verifying' | 'done' | 'error'>(
    'loading'
  );

  // Mark mounted to avoid SSR hydration abort of widget fetch
  useEffect(() => { setMounted(true); }, []);

  // Get the return URL from either query param or current pathname
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Set date client-only to avoid hydration mismatch (server vs client locale/timezone)
    setCurrentDate(new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }));

    // Set the hostname for display
    setHostname(window.location.host);
    
    // Parse URL search params directly from window.location
    const urlParams = new URLSearchParams(window.location.search);
    let url = urlParams.get('returnUrl');
    const nextSessionId = urlParams.get('sessionId');
    setSessionId(nextSessionId);
    
    // If no query param, use the current pathname (for rewritten pages)
    if (!url) {
      url = window.location.pathname;
    }
    
    // Default to home
    if (!url || url === '/captcha') {
      url = '/';
    }
    
    // Security: Only allow relative paths starting with /
    if (!url.startsWith('/') || url.startsWith('//')) {
      url = '/';
    }
    
    // Security: Validate the URL is a relative path only
    // Parse as URL to ensure it's relative (will throw for malformed URLs)
    let validatedUrl: string;
    try {
      // Try to parse as relative URL
      const testUrl = new URL(url, 'http://localhost');
      // Ensure it's a relative path (no protocol, no host)
      if (testUrl.protocol === 'http:' && testUrl.hostname === 'localhost' && url.startsWith('/')) {
        validatedUrl = testUrl.pathname + testUrl.search + testUrl.hash;
      } else {
        validatedUrl = '/';
      }
    } catch {
      validatedUrl = '/';
    }
    
    // Additional safety: ensure no javascript:, data:, or other dangerous protocols
    const dangerousPatterns = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:'];
    const hasDangerousPattern = dangerousPatterns.some(pattern => 
      validatedUrl.toLowerCase().includes(pattern)
    );
    if (hasDangerousPattern) {
      validatedUrl = '/';
    }
    
    console.log('Return URL set to:', validatedUrl);
    setReturnUrl(validatedUrl);

    posthog.capture('captcha_viewed', {
      return_url: url,
      path: window.location.pathname,
      risk_score: urlParams.get('riskScore'),
      severity: urlParams.get('severity'),
    });
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setResourceProofReady(true);
      return;
    }

    let cancelled = false;

    const markResourceProof = async () => {
      try {
        await Promise.all([
          fetch('/api/captcha/resource-loaded', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              resourcePath: '/captcha/client.js',
              type: 'js',
            }),
          }),
          fetch('/api/captcha/resource-loaded', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              resourcePath: '/captcha/client.css',
              type: 'css',
            }),
          }),
        ]);

        const verification = await fetch('/api/captcha/verify-resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            expectedResources: {
              js: '/captcha/client.js',
              css: '/captcha/client.css',
            },
          }),
        });

        if (!cancelled) {
          setResourceProofReady(true);
          if (!verification.ok) {
            posthog.capture('captcha_resource_proof_failed', {
              session_id: sessionId,
              status: verification.status,
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setResourceProofReady(true);
          posthog.capture('captcha_resource_proof_error', {
            session_id: sessionId,
            message: error instanceof Error ? error.message : 'resource_proof_failed',
          });
        }
      }
    };

    void markResourceProof();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Theme detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check localStorage for theme preference
    const storedTheme = localStorage.getItem('theme');
    let detectedTheme: 'light' | 'dark';
    
    if (storedTheme === 'dark' || storedTheme === 'light') {
      detectedTheme = storedTheme;
    } else {
      // If no stored theme, check device preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      detectedTheme = prefersDark ? 'dark' : 'light';
    }

    setTheme(detectedTheme);

    // Apply theme to ribaunt-widget CSS custom properties
    const root = document.documentElement;
    
    // Reset all theme variables first
    root.style.removeProperty('--ribaunt-background');
    root.style.removeProperty('--ribaunt-border-color');
    root.style.removeProperty('--ribaunt-color');
    root.style.removeProperty('--ribaunt-checkbox-background');
    root.style.removeProperty('--ribaunt-spinner-color');
    root.style.removeProperty('--ribaunt-spinner-background-color');
    root.style.removeProperty('--ribaunt-logo-color');

    if (detectedTheme === 'dark') {
      root.style.setProperty('--ribaunt-background', '#2d2d2d');
      root.style.setProperty('--ribaunt-border-color', '#555');
      root.style.setProperty('--ribaunt-color', '#ffffff');
      root.style.setProperty('--ribaunt-checkbox-background', '#444');
      root.style.setProperty('--ribaunt-spinner-color', '#fff');
      root.style.setProperty('--ribaunt-spinner-background-color', '#333');
      root.style.setProperty('--ribaunt-logo-color', '#ccc');
    }
  }, []);

  const completeVerification = useCallback(() => {
    if (hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    setHeading('Continuing to your destination...');

    posthog.capture('captcha_verified', {
      return_url: returnUrl,
    });

    console.log('Redirecting to:', returnUrl);

    setTimeout(() => {
      posthog.capture('captcha_redirected', {
        return_url: returnUrl,
      });
      window.location.assign(returnUrl);
    }, 300);
  }, [returnUrl]);

  useEffect(() => {
    hasRedirectedRef.current = false;
  }, [returnUrl]);

  const markWidgetLoaded = useCallback(() => {
    if (hasTrackedWidgetLoadedRef.current) {
      return;
    }

    hasTrackedWidgetLoadedRef.current = true;
    setWidgetStatus((current) => (current === 'loading' ? 'ready' : current));
    posthog.capture('captcha_widget_loaded', {
      return_url: returnUrl,
    });
    posthog.capture('captcha_widget_mounted', {
      return_url: returnUrl,
    });
  }, [returnUrl]);

  useEffect(() => {
    if (widgetStatus !== 'ready') {
      return;
    }

    setHeading('Verifying you are a human before proceeding...');
  }, [widgetStatus]);

  const handleVerify = useCallback(
    (detail: { solutions: unknown[]; phase: 'done'; progress: 100 }) => {
      console.log(`[captcha] verify | solutions=${detail.solutions.length} | phase=${detail.phase} | progress=${detail.progress}%`);
      markWidgetLoaded();
      setWidgetStatus('done');
      completeVerification();
    },
    [completeVerification, markWidgetLoaded]
  );

  const handleError = useCallback(
    (detail: { error: string; code: string; timeout: boolean; phase: 'error' }) => {
      console.error(`[captcha] error | code=${detail.code} | timeout=${detail.timeout} | message=${detail.error}`);
      markWidgetLoaded();
      setWidgetStatus('error');
      posthog.capture('captcha_error', {
        source: 'widget',
        return_url: returnUrl,
        message: detail.error,
        code: detail.code,
        timeout: detail.timeout,
      });
    },
    [markWidgetLoaded, returnUrl]
  );

  const handleStateChange = useCallback(
    (detail: { state: string; phase: string; progress: number }) => {
      markWidgetLoaded();
      const nextState = detail.state;
      console.log(`[captcha] state | state=${nextState} | phase=${detail.phase} | progress=${detail.progress}%`);

      if (detail.state === 'initial') {
        setWidgetStatus('ready');
      } else if (detail.state === 'fetching' || detail.state === 'solving' || detail.state === 'verifying') {
        setWidgetStatus('verifying');
      } else if (detail.state === 'done') {
        setWidgetStatus('done');
      } else if (detail.state === 'error') {
        setWidgetStatus('error');
      }

      posthog.capture('captcha_state_change', {
        state: nextState,
        progress: detail.progress,
        return_url: returnUrl,
      });

      if (detail.state === 'done') {
        completeVerification();
      } else if (detail.state === 'initial') {
        setHeading('Verifying you are a human before proceeding...');
      } else if (detail.state === 'solving' && detail.progress > 0) {
        setHeading('Solving challenge...');
      }
    },
    [completeVerification, markWidgetLoaded, returnUrl]
  );

  const handleReady = useCallback(
    (detail: { state: string }) => {
      console.log(`[captcha] ready | state=${detail.state}`);
      markWidgetLoaded();
      const nextState = detail.state;

      if (nextState === 'fetching' || nextState === 'solving' || nextState === 'verifying') {
        setWidgetStatus('verifying');
      } else if (nextState === 'done') {
        setWidgetStatus('done');
      } else if (nextState === 'error') {
        setWidgetStatus('error');
      } else {
        setWidgetStatus('ready');
      }
    },
    [markWidgetLoaded]
  );

  const handleEvent = useCallback(
    (type: 'verify' | 'error' | 'state-change' | 'ready' | 'solver-backend', detail: unknown) => {
      console.log(`[captcha] event | type=${type}`, detail);
      if (type === 'solver-backend') {
        const backend = (detail as { backend: 'wasm' | 'js' })?.backend;
        posthog.capture('captcha_solver_backend', {
          backend,
          return_url: returnUrl,
        });
      }
    },
    [returnUrl]
  );

  // ribaunt v0.2.4 dispatches `solver-backend` from the worker, but the React
  // wrapper does not forward it via onEvent — attach directly to the element.
  // Mount-once: use MutationObserver to catch the element when it appears after
  // resourceProofReady, no widgetStatus dep to avoid churn/abort.
  useEffect(() => {
    let el: HTMLElement | null = null;
    let handler: ((e: Event) => void) | null = null;
    let observer: MutationObserver | null = null;

    const attach = (target: HTMLElement) => {
      if (el === target) return;
      if (el && handler) el.removeEventListener('solver-backend', handler as EventListener);
      el = target;
      handler = (e: Event) => {
        const detail = (e as CustomEvent<{ backend: 'wasm' | 'js' }>).detail;
        console.log(`[captcha] solver-backend | backend=${detail.backend}`);
        posthog.capture('captcha_solver_backend', {
          backend: detail.backend,
          return_url: returnUrl,
        });
        handleEvent('solver-backend', detail);
      };
      el.addEventListener('solver-backend', handler as EventListener);
    };

    const tryAttach = () => {
      const found = (widgetRef.current as unknown as HTMLElement | null)
        ?? document.querySelector('.widget-container ribaunt-widget') as HTMLElement | null;
      if (found) attach(found);
      return !!found;
    };

    if (!tryAttach()) {
      observer = new MutationObserver(() => { if (tryAttach() && observer) { observer.disconnect(); observer = null; } });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      if (observer) observer.disconnect();
      if (el && handler) el.removeEventListener('solver-backend', handler as EventListener);
    };
  }, [handleEvent, returnUrl]);

  return (
    <>
      <style jsx global>{`
        body {
          background-color: ${theme === 'dark' ? '#0a0a0a' : '#ffffff'} !important;
          color: ${theme === 'dark' ? '#ededed' : '#171717'} !important;
        }
      `}</style>
      <style jsx>{`
        * {
          box-sizing: border-box;
        }
        .container {
          max-width: 690px;
          margin: 3em auto;
          padding: 18px;
          font-family: system-ui;
          background-color: ${theme === 'dark' ? '#0a0a0a' : '#ffffff'};
        }
        .title-container {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 0px;
        }
        .site-logo {
          width: 30px;
          height: 30px;
          border-radius: 6px;
        }
        h1 {
          font-weight: 600;
          font-size: 26px;
          margin-bottom: 0px;
        }
        h2 {
          font-weight: 400;
          font-size: 20px;
          margin-top: 7px;
          margin-bottom: 1.5em;
          color: ${theme === 'dark' ? '#ededed' : '#171717'};
        }
        .widget-container {
          margin-bottom: 2em;
        }
        .loading {
          color: ${theme === 'dark' ? '#ccc' : '#666'};
          font-size: 14px;
          margin-bottom: 12px;
        }
        hr {
          border: 0;
          border-top: 1px solid ${theme === 'dark' ? '#333333' : '#dddddd8f'};
          margin: 2em 0;
        }
        h3 {
          font-weight: 600;
          font-size: 18px;
          margin-top: 1.5em;
          margin-bottom: 0px;
        }
        p {
          font-weight: 400;
          font-size: 16px;
          line-height: 1.5;
          margin-top: 10px;
          color: ${theme === 'dark' ? '#ededed' : '#171717'};
        }
        footer {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        footer .credit {
          display: flex;
          gap: 8px;
          align-items: center;
          text-decoration: none;
          color: ${theme === 'dark' ? '#ededed' : '#171717'};
        }
        footer .credit:hover {
          opacity: 0.7;
        }
        footer .credit img {
          width: 26px;
          height: 26px;
        }
        footer .date {
          font-size: 15px;
          color: ${theme === 'dark' ? '#888' : '#888'};
          margin: 0px;
          margin-left: auto;
        }
      `}</style>

      <div className="container">
        <div className="title-container">
          <Image
            src="/favicon.ico"
            alt="Site logo"
            className="site-logo"
            width={30}
            height={30}
            onError={(e) => {
              // Hide the image on error to preserve original behavior
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <h1 suppressHydrationWarning>{hostname}</h1>
        </div>
        <h2 suppressHydrationWarning>{heading}</h2>

        <div className="widget-container" suppressHydrationWarning>
          {widgetStatus === 'loading' && (
            <div className="loading">Loading verification widget...</div>
          )}
          {!mounted ? (
            <div className="loading">Loading verification widget...</div>
          ) : resourceProofReady ? (
            <RibauntWidget
              key={`ribaunt-${mounted}-${resourceProofReady}`}
              ref={widgetRef}
              challengeEndpoint="/api/captcha/challenge"
              verifyEndpoint={`/api/captcha/verify${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`}
              autoVerify={true}
              solveTimeout={120000}
              showWarning={false}
              showProgress={false}
              wasmMode="preferred"
              workerMode="preferred"
              fallback={<div className="loading">Loading verification widget...</div>}
              onVerify={handleVerify}
              onError={handleError}
              onStateChange={handleStateChange}
              onReady={handleReady}
              onEvent={handleEvent}
            />
          ) : (
            <div className="loading">Preparing browser verification...</div>
          )}
        </div>
        <noscript>
          <style>{`
            .info {
              display: none;
            }
            a {
              color: ${theme === 'dark' ? '#4a9eff' : '#0a91e7'};
            }
            h3 {
              line-height: 1.3;
              margin-bottom: 1em;
            }
          `}</style>
          <h3>
            JavaScript is disabled and we were unable to verify you. To access this page, please{' '}
            <a
              href="https://www.whatismybrowser.com/guides/how-to-enable-javascript/auto"
              target="_blank"
              rel="nofollow noopener"
            >
              enable JavaScript
            </a>
          </h3>
          <hr />
        </noscript>

        <div className="info">
          <hr />

          <h3>Why am I seeing this page?</h3>
          <p>
            To keep this site secure, we need to confirm your request is coming from a legitimate
            source. This will be a quick check to help stop abuse.
          </p>

          <h3>What should I do?</h3>
          <p>
            No action is required on your end. Once verified, you&apos;ll continue to your destination.
            If you&apos;re stuck, try refreshing the page or checking your connection.
          </p>

          <hr />
        </div>

        <footer>
          <a
            href="https://ribaunt.com"
            target="_blank"
            rel="noopener"
            className="credit"
          >
            <span>Secured by Ribaunt</span>
          </a>
          <p className="date" suppressHydrationWarning>{currentDate || '\u00A0'}</p>
        </footer>
      </div>
    </>
  );
}
