'use client';

import { useState } from 'react';
import { CURRENCY_EXPONENT, type Currency } from '@/lib/types';

function minorToMajor(minor: number, currency: Currency): string {
  return String(minor / 10 ** CURRENCY_EXPONENT[currency]);
}

function majorToMinor(major: string, currency: Currency): number | null {
  const n = Number(major.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** CURRENCY_EXPONENT[currency]);
}

/**
 * A small editable number field for E1's inline what-ifs and E2's scenario
 * editor. `currency` is optional — pass it for money fields (converts
 * major/minor at the field's own currency exponent) and omit it for a plain
 * decimal field like hours-per-day.
 */
export function InlineNumberField({
  valueMinor,
  currency,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  valueMinor: number;
  currency?: Currency;
  onChange: (nextMinor: number) => void;
  className?: string;
  'aria-label'?: string;
}) {
  const [draft, setDraft] = useState(
    currency ? minorToMajor(valueMinor, currency) : String(valueMinor)
  );

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = currency
          ? majorToMinor(draft, currency)
          : Number(draft.replace(',', '.'));
        if (next === null || !Number.isFinite(next)) {
          setDraft(currency ? minorToMajor(valueMinor, currency) : String(valueMinor));
          return;
        }
        onChange(next);
      }}
      className={
        className ??
        'w-24 rounded border border-sand-300 px-2 py-1 text-right text-sm'
      }
    />
  );
}
