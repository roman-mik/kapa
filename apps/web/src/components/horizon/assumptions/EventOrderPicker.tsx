'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { ProjectionEventKind } from '@/lib/horizon/types';
import { setEventOrder } from '@/app/actions/horizon-settings';
import { useToast } from '@/components/ui/Toast';

export function EventOrderPicker({
  initialOrder,
}: {
  initialOrder: ProjectionEventKind[];
}) {
  const t = useTranslations('Horizon.assumptions.eventOrder');
  const toast = useToast();
  const [order, setOrder] = useState<ProjectionEventKind[]>(initialOrder);
  const [isPending, startTransition] = useTransition();

  const move = (index: number, direction: -1 | 1) => {
    if (isPending) return;
    const target = index + direction;
    if (target < 0 || target >= order.length) return;

    const previous = order;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);

    startTransition(async () => {
      const res = await setEventOrder({ eventOrder: next });
      if (!res.ok) {
        setOrder(previous);
        toast.error(res.error);
      } else {
        toast.success(t('settingsSaved'));
      }
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('description')}</p>
      </div>

      <ol className="flex flex-col gap-2">
        {order.map((kind, index) => (
          <li
            key={kind}
            className="flex items-center justify-between rounded-lg border border-border bg-bg px-4 py-2"
          >
            <span className="text-sm font-medium text-text-primary">
              {t(`kind.${kind}`)}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={isPending || index === 0}
                onClick={() => move(index, -1)}
                aria-label={t('moveUpAria', { kind: t(`kind.${kind}`) })}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:text-text-primary disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={isPending || index === order.length - 1}
                onClick={() => move(index, 1)}
                aria-label={t('moveDownAria', { kind: t(`kind.${kind}`) })}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:text-text-primary disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
