"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SubscriptionCardProps {
  productId?: string;
  title?: string;
  description?: string;
  price?: string;
  features?: string[];
}

export default function SubscriptionCard(_props: SubscriptionCardProps) {
  const t = useTranslations('subscription');

  const cardFeatures = [
    t('features.increasedLimits'),
    t('features.moreSearchOptions'),
    t('features.prioritySupport'),
  ];

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
        <p className="text-xs text-muted-foreground mt-4">
          {t('info.everythingIsOpen')}
        </p>
      </CardContent>
    </Card>
  );
}
