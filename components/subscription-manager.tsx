"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, Sparkles, CreditCard, Calendar, AlertCircle, RefreshCw, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';

interface SubscriptionManagerProps {
  productId?: string;
}

interface SubscriptionInfo {
  id: string;
  status: string;
  currentPeriodEnd: string | number | null;
  currentPeriodStart?: string | number | null;
  cancelAtPeriodEnd: boolean;
  product?: {
    name: string;
    description: string;
  };
  price?: {
    amount: number;
    currency: string;
    recurring: {
      interval: string;
      intervalCount: number;
    };
  };
}

export default function SubscriptionManager({
  productId = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID || '',
}: SubscriptionManagerProps) {
  const { user } = useAuth();
  const t = useTranslations('subscription');
  const [cardLoading, setCardLoading] = useState(false);
  const [moneroLoading, setMoneroLoading] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const isPaid = user?.roles?.some((role: string) => role.toLowerCase() === 'paid');

  // Features list
  const features = [
    t('features.increasedLimits'),
    t('features.moreSearchOptions'),
    t('features.prioritySupport'),
    t('features.prioritizedFeedback')
  ];

  // Check for active subscription when user is paid
  useEffect(() => {
    const checkSubscription = async () => {
      if (!isPaid) {
        setCheckingSubscription(false);
        return;
      }

      await fetchSubscriptionData();
    };

    checkSubscription();
  }, [isPaid]);

  const fetchSubscriptionData = async () => {
    try {
      setError(null);
      const response = await fetch('/api/polar/subscription', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.hasSubscription && data.subscription) {
          setSubscription(data.subscription);
        } else {
          setSubscription(null);
        }
      } else {
        setError('Failed to fetch subscription data');
      }
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      setError('Network error while fetching subscription');
    } finally {
      setCheckingSubscription(false);
      setLastFetched(new Date());
    }
  };

  const handleUpgrade = async () => {
    setCardLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/polar/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('errors.checkoutFailed'));
      }

      // Capture subscription checkout started event in PostHog
      posthog.capture('subscription_checkout_started', {
        product_id: productId,
      });

      // Redirect to Polar checkout
      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(err instanceof Error ? err.message : t('errors.upgradeFailed'));
      setCardLoading(false);
    }
  };

  const handleMoneroUpgrade = async () => {
    setMoneroLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cheyn/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t('errors.checkoutFailed'));
      }

      posthog.capture('subscription_checkout_started', {
        payment_method: 'monero',
        provider: 'cheyn',
      });

      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error('Monero upgrade error:', err);
      setError(err instanceof Error ? err.message : t('errors.upgradeFailed'));
      setMoneroLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    setRefreshingStatus(true);
    setError(null);
    setRefreshFailed(false);
    try {
      const response = await fetch('/api/polar/refresh-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Failed to refresh subscription status');
      }

      if (!data.foundActiveSubscription) {
        setRefreshFailed(true);
      }

      if (data.foundActiveSubscription) {
        setRefreshFailed(false);
        // Reload to ensure auth context / UI reflects Plus role.
        window.location.reload();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh subscription status');
      setRefreshFailed(true);
    } finally {
      setRefreshingStatus(false);
    }
  };

  const formatPrice = (amount: number, currency: string, interval: string, intervalCount: number) => {
    const formattedAmount = (amount / 100).toFixed(2);
    const currencySymbol = currency === 'usd' ? '$' : currency.toUpperCase();
    const intervalText = intervalCount === 1 ? interval : `${intervalCount} ${interval}s`;
    return `${currencySymbol}${formattedAmount}/${intervalText}`;
  };

  const formatDate = (dateInput: number | string | null | undefined) => {
    if (!dateInput) return 'N/A';
    
    try {
      // Handle both Unix timestamp (number) and ISO string
      const date = typeof dateInput === 'number' 
        ? new Date(dateInput * 1000)  // Unix timestamp in seconds
        : new Date(dateInput);         // ISO string
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/polar/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('errors.portalFailed'));
      }

      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        throw new Error(t('errors.portalFailed'));
      }
    } catch (err) {
      console.error('Portal link error:', err);
      setError(err instanceof Error ? err.message : t('errors.portalFailed'));
      setPortalLoading(false);
    }
  };

  // Free user view - show upgrade option
  if (!isPaid) {
    return (
      <Card className="border-2 border-border hover:border-primary/50 transition-colors ph-no-capture">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              <CardTitle>{t('title')}</CardTitle>
            </div>
            <div className="text-lg font-bold px-3 py-1 border rounded-md bg-primary/5">
              {t('price')}
            </div>
          </div>
          <CardDescription>
            {t('description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          {error && (
            <div className="w-full p-3 text-sm bg-destructive/10 text-destructive rounded-md flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleUpgrade}
              disabled={cardLoading || moneroLoading || refreshingStatus || !user}
              className="flex-1"
              size="lg"
            >
              {cardLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('actions.loading')}
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Pay with card
                </>
              )}
            </Button>
            <Button
              onClick={handleMoneroUpgrade}
              disabled={cardLoading || moneroLoading || refreshingStatus || !user}
              className="flex-1"
              variant="outline"
              size="lg"
            >
              {moneroLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('actions.loading')}
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 mr-2" />
                  Pay with Monero
                </>
              )}
            </Button>
            <Button
              onClick={handleRefreshStatus}
              disabled={cardLoading || moneroLoading || refreshingStatus || !user}
              variant="outline"
              size="lg"
              className={refreshFailed ? "shrink-0 border-destructive text-destructive hover:bg-destructive/10" : "shrink-0"}
              aria-invalid={refreshFailed || undefined}
              title="Refresh subscription status"
              aria-label="Refresh subscription status"
            >
              {refreshingStatus ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
          {!user && (
            <p className="text-xs text-muted-foreground text-center">
              {t('actions.signInRequired')}
            </p>
          )}
        </CardFooter>
      </Card>
    );
  }

  // Paid user view - show subscription info
  if (checkingSubscription) {
    return (
      <Card className="border-2 border-primary/20 ph-no-capture">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">{t('status.loading')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 ph-no-capture">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription className="text-primary/80 font-medium">
              {t('activeSubscription')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Subscription Status */}
        <div className="p-4 bg-background/50 rounded-lg border border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">{t('status.title')}: {t('status.active')}</span>
            </div>
            <div className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
              {t('plusMember')}
            </div>
          </div>
          
          {/* Billing Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                <span>{t('billing.cycle')}</span>
              </div>
              <span className="font-medium">{t('billing.monthly')}</span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{t('billing.nextInvoice')}</span>
              </div>
              <span className="font-medium">
                {subscription?.currentPeriodEnd 
                  ? formatDate(subscription.currentPeriodEnd)
                  : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                }
              </span>
            </div>
          </div>
        </div>

        {/* Features Included */}
        <div>
          <h4 className="text-sm font-medium mb-3">{t('info.includedFeatures')}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {features.slice(0, 4).map((feature, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-3">
        {/* Manage Subscription Button */}
        <Button
          onClick={handleManageSubscription}
          disabled={portalLoading}
          variant="secondary"
          className="w-full inline-flex items-center justify-center gap-2"
        >
          {portalLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4" />
          )}
          {portalLoading ? t('actions.loading') : t('actions.manage')}
        </Button>

        {error && (
          <div className="w-full p-3 text-sm bg-destructive/10 text-destructive rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Additional Info */}
        <p className="text-xs text-muted-foreground text-center">
          {t('info.manageInfo')}
        </p>
      </CardFooter>
    </Card>
  );
}
