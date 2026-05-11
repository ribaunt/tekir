"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import convex from "@/lib/convex-proxy";
import { trackClientLog, trackSignIn, trackSignOut, trackAuthError } from "@/lib/posthog-analytics";

// Define user settings interface
interface UserSettings {
  searchEngine?: string;
  country?: string;
  language?: string;
  safesearch?: string;
  theme?: string;
  wikipediaEnabled?: boolean;
  karakulakEnabled?: boolean;
  aiModel?: string;
  [key: string]: string | boolean | undefined;
}

interface User {
  id: string;
  email: string;
  username: string;
  name?: string;
  image?: string;
  imageType?: string;
  avatar?: string;
  updatedAt?: number;
  isEmailVerified: boolean;
  roles?: string[];
  settings?: UserSettings;
  polarCustomerId?: string;
}

interface AuthContextType {
  user: User | null;
  status: "loading" | "authenticated" | "unauthenticated";
  authToken: string | null;
  signOut: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  checkAuthStatus: (force?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const isCheckingRef = useRef(false); // Use ref instead of state to prevent re-renders
  const lastCheckTimeRef = useRef(0); // Track last check time to prevent spam
  const initialCheckDoneRef = useRef(false); // Track if initial check completed
  const pendingAuthCheckRef = useRef<(() => void) | null>(null); // Store pending forced auth check
  const authCheckPromiseRef = useRef<{ resolve: (value: boolean) => void; reject: (reason?: any) => void } | null>(null); // For promise-based auth checks

  const checkAuthStatus = useCallback(async (force = false, retryCount = 0) => {
    // Prevent multiple simultaneous auth checks
    if (isCheckingRef.current) {
      if (force) {
        pendingAuthCheckRef.current = () => {
          void checkAuthStatus(true);
        };
        setStatus("loading");
      }
      return;
    }

    // Throttle calls - don't check more than once every 30 seconds unless forced
    const now = Date.now();
    if (!force && now - lastCheckTimeRef.current < 30000) {
      return;
    }

    const startTime = Date.now();
    isCheckingRef.current = true;
    lastCheckTimeRef.current = now;
    try {
      // Verify JWT token with our backend - cookie will be sent automatically
      const response = await fetch('/api/auth/verify-jwt', {
        method: 'GET',
        credentials: 'include', // Include cookies
      });

      if (response.ok) {
        const authData = await response.json();

        if (authData.authenticated && authData.user) {
          // Set Convex auth token
          if (authData.token) {
            setAuthToken(authData.token);
            await convex.setAuth(async () => authData.token);
          } else {
            setAuthToken(null);
            await convex.setAuth(async () => null);
          }

          const newUser = {
            ...authData.user,
            isEmailVerified: true // JWT users are already verified
          };

          // Only update user if the data has actually changed
          setUser(prevUser => {
            const prevRoles = (prevUser?.roles ?? []).join(',');
            const nextRoles = (newUser?.roles ?? []).join(',');
            const wasPreviouslyUnauthenticated = !prevUser;
            if (!prevUser ||
              prevUser.id !== newUser.id ||
              prevUser.email !== newUser.email ||
              prevUser.name !== newUser.name ||
              prevUser.username !== newUser.username ||
              prevUser.image !== newUser.image ||
              prevUser.imageType !== newUser.imageType ||
              (prevUser as any).updatedAt !== (newUser as any).updatedAt ||
              prevRoles !== nextRoles) {
              // Track sign in if this was a new authentication
              if (wasPreviouslyUnauthenticated) {
                trackSignIn('jwt', false);
                // Identify user in analytics
                if (typeof window !== 'undefined' && (window as any).posthog) {
                  (window as any).posthog.identify(newUser.id, {
                    email: newUser.email,
                    username: newUser.username,
                    roles: newUser.roles,
                  });
                }
              }
              return newUser;
            }
            return prevUser;
          });
          // Only set authenticated status AFTER Convex auth is ready
          setStatus("authenticated");
          initialCheckDoneRef.current = true;

          // Resolve any pending auth check promise
          if (authCheckPromiseRef.current && !pendingAuthCheckRef.current) {
            authCheckPromiseRef.current.resolve(true);
          }
        } else {
          setAuthToken(null);
          await convex.setAuth(async () => null);
          setUser(null);
          setStatus("unauthenticated");
          initialCheckDoneRef.current = true;

          // Resolve any pending auth check promise (not authenticated)
          if (authCheckPromiseRef.current && !pendingAuthCheckRef.current) {
            authCheckPromiseRef.current.resolve(false);
          }
        }
      } else {
        setAuthToken(null);
        await convex.setAuth(async () => null);
        setUser(null);
        setStatus("unauthenticated");
        initialCheckDoneRef.current = true;

        // Resolve any pending auth check promise (not authenticated)
        if (authCheckPromiseRef.current && !pendingAuthCheckRef.current) {
          authCheckPromiseRef.current.resolve(false);
        }
      }
    } catch (error) {
      console.error('JWT auth check failed:', error);

      // Retry logic for transient network issues on initial check
      if (!initialCheckDoneRef.current && retryCount < 2) {
        trackClientLog('auth_check_retry', {
          attempt: retryCount + 1,
          max_attempts: 2,
        });
        isCheckingRef.current = false;
        // Exponential backoff: 500ms, then 1000ms
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return checkAuthStatus(force, retryCount + 1);
      }

      // Add minimum delay before showing unauthenticated on initial check
      // This prevents a flash of "guest" UI when the network is just slow
      if (!initialCheckDoneRef.current) {
        const elapsed = Date.now() - startTime;
        const minDelay = 500; // 500ms minimum delay for initial check
        if (elapsed < minDelay) {
          await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
        }
      }

      setAuthToken(null);
      setUser(null);
      setStatus("unauthenticated");
      initialCheckDoneRef.current = true;

      // Resolve any pending auth check promise (not authenticated on error)
      if (authCheckPromiseRef.current && !pendingAuthCheckRef.current) {
        authCheckPromiseRef.current.resolve(false);
      }
    } finally {
      isCheckingRef.current = false;

      const pendingAuthCheck = pendingAuthCheckRef.current;
      if (pendingAuthCheck) {
        pendingAuthCheckRef.current = null;
        pendingAuthCheck();
      }
    }
  }, []); // No dependencies to prevent recreation

  useEffect(() => {
    let sessionTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleAuthLogin = async () => {
      // Create a promise that resolves when auth check completes
      const authPromise = new Promise<boolean>((resolve, reject) => {
        authCheckPromiseRef.current = { resolve, reject };
      });

      // Force immediate check on login
      checkAuthStatus(true);

      // Wait for the auth check to complete (with timeout)
      try {
        const isAuthenticated = await Promise.race([
          authPromise,
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Auth check timeout')), 5000)
          )
        ]);
        return isAuthenticated;
      } catch (error) {
        console.error('Auth login check failed:', error);
        return false;
      } finally {
        authCheckPromiseRef.current = null;
      }
    };

    const doAuthCheck = () => {
      checkAuthStatus(true);
    };

    const handleAuthLoginEvent = async () => {
      const isAuthenticated = await handleAuthLogin();
      // Dispatch confirmation event with the result
      window.dispatchEvent(new CustomEvent('auth-login-confirmed', { detail: isAuthenticated }));
    };

    const handleAuthLogout = () => {
      // Clear local state; server clears cookies
      setUser(null);
      setStatus("unauthenticated");
    };

    window.addEventListener('auth-login', handleAuthLoginEvent);
    window.addEventListener('auth-logout', handleAuthLogout);

    // Check if session is already registered (from sessionStorage flag set by client-layout)
    if ((window as any).__sessionRegistered) {
      // Session already registered, proceed with auth check
      doAuthCheck();
    } else {
      // Session not registered yet - wait for the event
      // This prevents race condition where auth check runs before session is ready
      window.addEventListener('session-registered', doAuthCheck, { once: true });

      // Also set up a timeout fallback (in case event never fires)
      sessionTimeoutId = setTimeout(() => {
        window.removeEventListener('session-registered', doAuthCheck);
        doAuthCheck();
      }, 2000); // 2 second fallback timeout
    }

    return () => {
      window.removeEventListener('auth-login', handleAuthLoginEvent);
      window.removeEventListener('auth-logout', handleAuthLogout);
      window.removeEventListener('session-registered', doAuthCheck);
      if (sessionTimeoutId) {
        clearTimeout(sessionTimeoutId);
      }
    };
  }, [checkAuthStatus]); // Depend on stable callback

  const signOut = async () => {
    try {
      // Call logout endpoint - cookie will be sent automatically
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Signout error:', error);
    } finally {
      // Track sign out event
      trackSignOut();

      // Always clear local state; server cleared cookies
      setAuthToken(null);
      await convex.setAuth(async () => null);
      setUser(null);
      setStatus("unauthenticated");

      // Reset analytics user identification
      if (typeof window !== 'undefined' && (window as any).posthog) {
        (window as any).posthog.reset();
      }

      window.location.href = '/';
    }
  };

  const updateUser = useCallback((userData: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...userData });
    }
  }, [user]);

  const refreshUser = useCallback(async () => {
    // Prevent multiple simultaneous refresh calls
    if (isCheckingRef.current) {
      return;
    }

    // Throttle calls - don't refresh more than once every 10 seconds
    const now = Date.now();
    if (now - lastCheckTimeRef.current < 10000) {
      return;
    }

    isCheckingRef.current = true;
    lastCheckTimeRef.current = now;
    try {
      // Verify JWT token with our backend to get fresh user data
      const response = await fetch('/api/auth/verify-jwt', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const authData = await response.json();

        if (authData.authenticated && authData.user) {
          if (authData.token) {
            setAuthToken(authData.token);
            await convex.setAuth(async () => authData.token);
          }
          const newUser = {
            ...authData.user,
            isEmailVerified: true
          };

          // Only update user if the data has actually changed
          setUser(prevUser => {
            const prevRoles = (prevUser?.roles ?? []).join(',');
            const nextRoles = (newUser?.roles ?? []).join(',');
            if (!prevUser ||
              prevUser.id !== newUser.id ||
              prevUser.email !== newUser.email ||
              prevUser.name !== newUser.name ||
              prevUser.username !== newUser.username ||
              prevUser.image !== newUser.image ||
              prevUser.imageType !== newUser.imageType ||
              (prevUser as any).updatedAt !== (newUser as any).updatedAt ||
              prevRoles !== nextRoles) {
              return newUser;
            }
            return prevUser;
          });
          setStatus("authenticated");
        }
      } else {
      }
    } catch (error) {
      console.error('AuthProvider: Error refreshing user data:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, []); // No dependencies to prevent recreation

  return (
    <AuthContext.Provider value={{ user, status, authToken, signOut, updateUser, refreshUser, checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

// No client-side manipulation of httpOnly cookies; rely on server endpoints
