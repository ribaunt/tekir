"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { getRedirectUrlWithFallback } from "@/lib/utils";
import posthog from "posthog-js";

export default function SignInPage() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailOrUsername,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Identify user in PostHog
        posthog.identify(emailOrUsername, {
          email: emailOrUsername.includes('@') ? emailOrUsername : undefined,
          username: !emailOrUsername.includes('@') ? emailOrUsername : undefined,
        });

        // Capture sign in event
        posthog.capture('user_signed_in', {
          method: 'email_password',
        });

        // Dispatch custom event to notify AuthProvider of successful login and wait for auth confirmation
        const authConfirmed = await new Promise<boolean>((resolve) => {
          const handleAuthConfirmed = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            resolve(detail === true);
          };

          window.addEventListener('auth-login-confirmed', handleAuthConfirmed, { once: true });
          window.dispatchEvent(new CustomEvent('auth-login'));

          // Fallback timeout in case auth provider doesn't respond
          setTimeout(() => {
            window.removeEventListener('auth-login-confirmed', handleAuthConfirmed);
            resolve(false);
          }, 5000);
        });

        // Redirect after auth is confirmed
        const redirectUrl = getRedirectUrlWithFallback('/');
        router.push(redirectUrl);
      } else {
        setError(data.error || "Invalid credentials");
      }
    } catch (error: any) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background ph-no-capture">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <Image
              src="/tekir-head.png"
              alt="Tekir Logo"
              width={80}
              height={44}
              className="mx-auto"
            />
          </Link>
          <h2 className="mt-6 text-3xl font-bold text-foreground">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Need an account?{" "}
            <Link className="text-primary hover:underline" href="/auth/signup">
              Sign up
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
              <div className="text-sm text-red-700 dark:text-red-200">{error}</div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="emailOrUsername" className="sr-only">
                Email or Username
              </label>
              <Input
                id="emailOrUsername"
                type="text"
                autoComplete="username"
                required
                disabled={loading}
                className="relative block w-full px-3 py-3"
                placeholder="Email or Username"
                name="emailOrUsername"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
              />
            </div>

            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={loading}
                className="relative block w-full px-3 py-3 pr-10"
                placeholder="Password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center disabled:opacity-50"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Eye className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <div>
            <LoadingButton
              type="submit"
              loading={loading}
              loadingText="Signing in..."
              className="w-full py-3"
            >
              Sign in
            </LoadingButton>
          </div>

          <div className="text-center">
            <Link
              className="text-sm text-muted-foreground hover:text-primary"
              href="/"
            >
              ← Back to home
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
