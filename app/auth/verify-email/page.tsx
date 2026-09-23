"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, CheckCircle2, AlertCircle, ArrowLeft, RotateCcw } from "lucide-react";
import { getRedirectUrlWithFallback } from "@/lib/utils";
import { showToast } from "@/lib/toast";

function VerifyEmailForm() {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.length !== 6) {
      setError("Please enter a valid 6-digit verification code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        
        // Notify auth provider that user has been authenticated
        window.dispatchEvent(new CustomEvent('auth-login'));
        
        // Check if user was automatically authenticated
        if (data.authenticated && data.user) {
          setTimeout(() => {
            const redirectUrl = getRedirectUrlWithFallback('/');
            router.push(redirectUrl);
          }, 2000);
        } else {
          // Fallback to login if authentication failed
          setTimeout(() => {
            const redirectUrl = getRedirectUrlWithFallback('/auth/signin?message=Email verified successfully');
            router.push(redirectUrl);
          }, 2000);
        }
      } else {
        setError(data.error || "Verification failed");
      }
    } catch (error) {
      console.error("Email verification error:", error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resendCode = async () => {
    try {
      const response = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setError("");
        showToast.success("Verification code sent!", "Check your email for the code");
      } else {
        setError("Failed to resend code");
        showToast.error("Failed to resend code", "Please try again later");
      }
    } catch (error) {
      setError("Failed to resend code");
      showToast.error("Failed to resend code", "Please check your connection");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-4">
          <div className="bg-card border border-border rounded-xl shadow-lg p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Email Verified!</h2>
              <p className="text-muted-foreground">
                Your email has been successfully verified. Signing you in...
              </p>
            </div>
            <div className="flex justify-center" aria-label="Signing you in">
              <div className="h-3 w-40 rounded bg-muted animate-pulse-fast" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <div className="bg-card border border-border rounded-xl shadow-lg p-8 space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Verify your email</h1>
              <p className="text-muted-foreground text-sm">
                We sent a 6-digit verification code to
              </p>
              <p className="font-medium text-primary text-sm break-all">
                {email}
              </p>
            </div>
          </div>
          
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium text-foreground">
                Verification Code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                maxLength={6}
                required
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-center text-xl tracking-[0.5em] font-mono"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground text-center">
                Enter the 6-digit code from your email
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || code.length !== 6}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>Verifying...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Verify Email
                </>
              )}
            </button>
          </form>

          {/* Actions */}
          <div className="space-y-4 pt-4 border-t border-border">
            <button
              type="button"
              onClick={resendCode}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center justify-center gap-2 py-2"
            >
              <RotateCcw className="w-4 h-4" />
              Didn&apos;t receive a code? Resend
            </button>

            <Link
              href="/auth/signin"
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center justify-center gap-2 py-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-4">
        <div className="bg-card border border-border rounded-xl shadow-lg p-8 text-center space-y-3" aria-label="Loading">
          <div className="h-5 w-32 rounded bg-muted animate-pulse-fast mx-auto" />
          <div className="h-3 w-full rounded bg-muted animate-pulse-fast" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyEmailForm />
    </Suspense>
  );
}
