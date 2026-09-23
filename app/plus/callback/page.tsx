'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/components/auth-provider';

function CallbackContent() {
  const router = useRouter();
  const { checkAuthStatus } = useAuth();

  const verifyCheckout = async () => {
    try {
      const response = await fetch('/api/polar/verify-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      // Always refresh auth and redirect to account settings
      // The webhook handles activation in the background
      await checkAuthStatus(true);
      router.push('/settings/account');
    } catch (error) {
      console.error('Verification error:', error);
      // Even on error, redirect to account settings
      await checkAuthStatus(true);
      router.push('/settings/account');
    }
  };

  useEffect(() => {
    verifyCheckout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 space-y-3" aria-label="Processing your subscription">
        <div className="h-5 w-2/3 rounded bg-muted animate-pulse-fast" />
        <div className="h-3 w-full rounded bg-muted animate-pulse-fast" />
        <div className="h-3 w-4/5 rounded bg-muted animate-pulse-fast" />
        <p className="text-muted-foreground text-sm">Processing your subscription...</p>
      </div>
    </div>
  );
}

export default function PlusCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 space-y-3" aria-label="Loading">
          <div className="h-5 w-1/2 rounded bg-muted animate-pulse-fast" />
          <div className="h-3 w-full rounded bg-muted animate-pulse-fast" />
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
