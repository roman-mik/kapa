'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { NegativeDay, Suggestion } from '@/lib/horizon/projection/types';
import {
  dismissNegativeDayAction,
  undismissNegativeDayAction,
} from '@/app/actions/horizon-projection';
import { useToast } from '@/components/ui/Toast';
import type { Currency } from '@/lib/types';

interface NegativeDayBannerProps {
  negativeDays: NegativeDay[];
  reportingCurrency: Currency;
}

export function NegativeDayBanner({
  negativeDays,
}: NegativeDayBannerProps) {
  const t = useTranslations('Horizon.timeline');
  const te = useTranslations('Errors');
  const toast = useToast();

  const nonDismissed = negativeDays.filter((day) => !day.dismissed);

  if (nonDismissed.length === 0) {
    return null;
  }

  return (
    <div className="rounded bg-red-50 p-4 text-sm text-red-900">
      <div className="font-medium mb-3">{t('negativeDaysWarning')}</div>
      <div className="space-y-3">
        {nonDismissed.map((day) => (
          <NegativeDayItem
            key={day.date}
            day={day}
            onDismiss={async (reason) => {
              const result = await dismissNegativeDayAction({
                negativeDate: day.date,
                shortfallMinor: day.shortfallMinor,
                currency: day.shortfallCurrency,
                reason,
              });
              if (result.ok) {
                toast.success(t('negativeDayDismissed'));
              } else {
                toast.error(result.error || te('saveFailed'));
              }
            }}
            onUndismiss={async () => {
              const result = await undismissNegativeDayAction(day.date);
              if (result.ok) {
                toast.success(t('negativeDayUndismissed'));
              } else {
                toast.error(result.error || te('saveFailed'));
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NegativeDayItem({
  day,
  onDismiss,
  onUndismiss,
}: {
  day: NegativeDay;
  reportingCurrency?: Currency;
  onDismiss: (reason: string) => Promise<void>;
  onUndismiss: () => Promise<void>;
}) {
  const t = useTranslations('Horizon.timeline');
  const [showDismissForm, setShowDismissForm] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDismiss = async () => {
    if (!reason.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onDismiss(reason);
      setShowDismissForm(false);
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number, currency: Currency): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  };

  const getTriggerLabel = (trigger: 'total' | 'account' | 'both'): string => {
    const triggerMap: Record<string, string> = {
      total: t('triggerTotal'),
      account: t('triggerAccount'),
      both: t('triggerBoth'),
    };
    return triggerMap[trigger];
  };

  return (
    <div className="rounded border border-red-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-semibold">{day.date}</span>
            <span className="text-xs text-red-700">
              {formatCurrency(day.shortfallMinor, day.shortfallCurrency)}{' '}
              {t('shortfall')}
            </span>
            <span className="text-xs bg-red-100 px-1.5 py-0.5 rounded">
              {getTriggerLabel(day.trigger)}
            </span>
          </div>

          {day.suggestions.length > 0 && (
            <div className="ml-2 space-y-1">
              <div className="text-xs font-medium text-red-800 mb-1">
                {t('suggestions')}:
              </div>
              {day.suggestions.map((suggestion) => (
                <SuggestionLine
                  key={suggestion.id}
                  suggestion={suggestion}
                  formatCurrency={formatCurrency}
                />
              ))}
            </div>
          )}
        </div>

        {!showDismissForm ? (
          <button
            type="button"
            onClick={() => setShowDismissForm(true)}
            className="text-xs text-red-700 hover:text-red-900 underline whitespace-nowrap"
          >
            {t('dismiss')}
          </button>
        ) : null}
      </div>

      {showDismissForm && (
        <div className="mt-3 pt-3 border-t border-red-200">
          <label className="text-xs font-medium text-red-900 block mb-1">
            {t('dismissReasonLabel')}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('dismissReasonPlaceholder')}
            className="w-full text-xs border border-red-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-red-400"
            rows={2}
            maxLength={500}
          />
          <div className="text-xs text-red-700 mt-1">
            {reason.trim().length}/500
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isSubmitting || !reason.trim()}
              className="text-xs px-2.5 py-1.5 bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('dismissing') : t('dismissConfirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDismissForm(false);
                setReason('');
              }}
              disabled={isSubmitting}
              className="text-xs px-2.5 py-1.5 bg-red-200 text-red-900 rounded hover:bg-red-300 disabled:opacity-50"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {day.dismissed && (
        <div className="mt-2 pt-2 border-t border-red-200">
          <div className="text-xs text-red-700 mb-1">
            <strong>{t('dismissed')}:</strong> {day.dismissedReason}
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsSubmitting(true);
              try {
                await onUndismiss();
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting}
            className="text-xs text-red-700 hover:text-red-900 underline"
          >
            {t('undo')}
          </button>
        </div>
      )}
    </div>
  );
}

function SuggestionLine({
  suggestion,
  formatCurrency,
}: {
  suggestion: Suggestion;
  formatCurrency: (amount: number, currency: Currency) => string;
}) {
  const t = useTranslations('Horizon.timeline');

  if (suggestion.kind === 'shiftPayment') {
    const dateText =
      suggestion.suggestedDate !== null
        ? suggestion.suggestedDate
        : t('noSuggestionDate');

    return (
      <div className="text-xs text-red-800">
        •{' '}
        {t('suggestShiftPayment', {
          label: suggestion.eventLabel,
          eventDate: suggestion.eventDate,
          amount: formatCurrency(Math.abs(suggestion.amountMinor), 'USD'),
          date: dateText,
        })}
      </div>
    );
  }

  if (suggestion.kind === 'bringForward') {
    return (
      <div className="text-xs text-red-800">
        •{' '}
        {t('suggestBringForward', {
          label: suggestion.eventLabel,
          amount: formatCurrency(Math.abs(suggestion.amountMinor), 'USD'),
          toDate: suggestion.toDate,
        })}
      </div>
    );
  }

  if (suggestion.kind === 'holdBack') {
    const fromText =
      suggestion.from !== null ? suggestion.from.label : t('noSourceInflow');

    return (
      <div className="text-xs text-red-800">
        •{' '}
        {t('suggestHoldBack', {
          amount: formatCurrency(Math.abs(suggestion.amountMinor), 'USD'),
          from: fromText,
        })}
      </div>
    );
  }

  return null;
}
