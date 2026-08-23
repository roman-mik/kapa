/**
 * View toggle for timeline projection display.
 * Switches between line/waterfall/table views via ?view=.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ProjectionView } from '@/app/horizon/timeline/parseProjectionRange';

interface ViewToggleProps {
  current: ProjectionView;
  from: string;
  to: string;
}

export async function ViewToggle({ current, from, to }: ViewToggleProps) {
  const t = await getTranslations('Horizon.timeline');

  return (
    <div className="flex gap-2">
      <Link
        href={`?from=${from}&to=${to}&view=line`}
        className={`rounded px-3 py-2 text-sm ${
          current === 'line'
            ? 'bg-blue-600 text-white'
            : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
        }`}
      >
        {t('viewLine')}
      </Link>
      <Link
        href={`?from=${from}&to=${to}&view=waterfall`}
        className={`rounded px-3 py-2 text-sm ${
          current === 'waterfall'
            ? 'bg-blue-600 text-white'
            : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
        }`}
      >
        {t('viewWaterfall')}
      </Link>
      <Link
        href={`?from=${from}&to=${to}&view=table`}
        className={`rounded px-3 py-2 text-sm ${
          current === 'table'
            ? 'bg-blue-600 text-white'
            : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
        }`}
      >
        {t('viewTable')}
      </Link>
    </div>
  );
}
