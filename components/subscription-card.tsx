"use client";

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, CreditCard, Loader2, RefreshCw, Sparkles, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SubscriptionCardProps {
  productId?: string;
  title?: string;
  description?: string;
  price?: string;
  features?: string[];
}

export default function SubscriptionCard({
  productId = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID || '',
  title,
  description,
  price,
  features,
}: SubscriptionCardProps) {
  const { user } = useAuth();
  const t = useTranslations('subscription');
  const [cardLoading, setCardLoading] = useState(false);
  const [moneroLoading, setMoneroLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const isPaid = user?.roles?.some((role: string) => role.toLowerCase() === 'paid');

  // Use translations with fallback to props
  const cardTitle = title || t('title');
  const cardDescription = description || t('descriptionBetter');
  const cardPrice = price || t('price');
  const cardFeatures = features || [
    t('features.increasedLimits'),
    t('features.moreSearchOptions'),
    t('features.prioritySupport')
  ];

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

      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error('Monero upgrade error:', err);
      setError(err instanceof Error ? err.message : t('errors.upgradeFailed'));
      setMoneroLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    setError(null);
    setRefreshMessage(null);

    try {
      const response = await fetch('/api/polar/refresh-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || t('errors.subscriptionCheckFailed', { fallback: 'Failed to refresh subscription status' } as any));
      }

      setRefreshMessage(data.message || 'Subscription status refreshed');

      // If the user is now paid, refresh the page to rehydrate auth context.
      if (data.foundActiveSubscription) {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh subscription');
    } finally {
      setRefreshing(false);
    }
  };

  if (isPaid) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 ph-no-capture">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>{t('proMember')}</CardTitle>
          </div>
          <CardDescription>
            {t('info.hasAccess')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {cardFeatures.map((feature, index) => (
              <div key={index} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <div className="w-full px-4 py-2 bg-secondary/50 text-secondary-foreground rounded-md text-center text-sm font-medium">
            {t('activeSubscription')}
          </div>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-border hover:border-primary/50 transition-colors ph-no-capture">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{cardTitle}</CardTitle>
          <div className="text-lg font-bold px-3 py-1 border rounded-md">
            {cardPrice}
          </div>
        </div>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {cardFeatures.map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <Check className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        {refreshMessage && (
          <div className="w-full p-2 text-sm bg-primary/10 text-primary rounded">
            {refreshMessage}
          </div>
        )}
        {error && (
          <div className="w-full p-2 text-sm bg-destructive/10 text-destructive rounded">
            {error}
          </div>
        )}
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleUpgrade}
            disabled={cardLoading || moneroLoading || refreshing || !user}
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
            disabled={cardLoading || moneroLoading || refreshing || !user}
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
            disabled={cardLoading || moneroLoading || refreshing || !user}
            variant="outline"
            size="lg"
            className="shrink-0"
            title="Refresh subscription status"
            aria-label="Refresh subscription status"
          >
            {refreshing ? (
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
