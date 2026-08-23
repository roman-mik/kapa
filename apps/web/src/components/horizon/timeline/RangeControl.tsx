/**
 * Range preset controls for the timeline.
 * Three preset <Link>s setting ?to= for 3/6/12 month ranges.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { addDays } from '@/lib/horizon/schedule';

interface RangeControlProps {
  from: string;
}

export async function RangeControl({ from }: RangeControlProps) {
  const t = await getTranslations('Horizon.timeline');

  const to3Months = addDays(from, 90 - 1);
  const to6Months = addDays(from, 183 - 1);
  const to12Months = addDays(from, 365 - 1);

  return (
    <div className="flex gap-2">
      <Link
        href={`?from=${from}&to=${to3Months}`}
        className="rounded bg-blue-100 px-3 py-2 text-sm text-blue-900 hover:bg-blue-200"
      >
        {t('range3months')}
      </Link>
      <Link
        href={`?from=${from}&to=${to6Months}`}
        className="rounded bg-blue-100 px-3 py-2 text-sm text-blue-900 hover:bg-blue-200"
      >
        {t('range6months')}
      </Link>
      <Link
        href={`?from=${from}&to=${to12Months}`}
        className="rounded bg-blue-100 px-3 py-2 text-sm text-blue-900 hover:bg-blue-200"
      >
        {t('range12months')}
      </Link>
    </div>
  );
}
