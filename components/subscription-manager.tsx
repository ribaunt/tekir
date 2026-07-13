"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SubscriptionManagerProps {
  productId?: string;
}

export default function SubscriptionManager(_props: SubscriptionManagerProps) {
  const t = useTranslations('subscription');

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
      <CardContent>
        <p className="text-muted-foreground">
          {t('info.everythingIsOpen')}
        </p>
      </CardContent>
    </Card>
  );
}
