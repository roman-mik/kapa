/**
 * Stale FX rate warning banner.
 * Reuses the today.ts pattern: isStale/rateAgeDays.
 */

import { getTranslations } from 'next-intl/server';
import { rateAgeDays } from '@/lib/horizon/today';

interface StaleRateBannerProps {
  oldestRateAsOfDate: string | null;
  today: string;
}

export async function StaleRateBanner({
  oldestRateAsOfDate,
  today,
}: StaleRateBannerProps) {
  if (!oldestRateAsOfDate) {
    return null;
  }

  const days = rateAgeDays(oldestRateAsOfDate, today);
  const isStale = days > 30;

  if (!isStale) {
    return null;
  }

  const t = await getTranslations('Horizon.timeline');

  return (
    <div className="rounded bg-yellow-100 p-4 text-sm text-yellow-900">
      <p className="font-medium">{t('staleRateWarning', { days })}</p>
      <p className="mt-1 text-xs">{t('staleRateNote')}</p>
    </div>
  );
}
