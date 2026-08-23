'use client';

/**
 * F1-F3: solve for the hourly rate that covers this month's commitments
 * after tax. Recomputes live from the draft tax-policy inputs (E1's "edit
 * and see it update" idiom) — only Save persists them via
 * `setHorizonTaxSettings`.
 */
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CURRENCY_EXPONENT, type Currency } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import type { FxRate, HorizonTaxSettings } from '@/lib/horizon/types';
import type {
  Obligation,
  ObligationSchedule,
  DailyExpense,
} from '@/lib/horizon/spending/types';
import type { IncomeStream } from '@/lib/horizon/income/types';
import { solveTargetRate } from '@/lib/horizon/target-rate/target-rate-math';
import { setHorizonTaxSettings } from '@/app/actions/horizon-target-rate';
import { useToast } from '@/components/ui/Toast';

function majorToMinor(major: string, currency: Currency): number | null {
  const n = Number(major.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** CURRENCY_EXPONENT[currency]);
}

function minorToMajor(minor: number, currency: Currency): string {
  return String(minor / 10 ** CURRENCY_EXPONENT[currency]);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function TargetRateApp({
  obligations,
  obligationSchedules,
  dailyExpenses,
  incomeStreams,
  calendar,
  reportingCurrency,
  rates,
  taxSettings,
}: {
  obligations: Obligation[];
  obligationSchedules: ObligationSchedule[];
  dailyExpenses: DailyExpense[];
  incomeStreams: IncomeStream[];
  calendar: ScheduleCalendar;
  reportingCurrency: Currency;
  rates: FxRate[];
  taxSettings: HorizonTaxSettings;
}) {
  const t = useTranslations('Horizon.targetRate');
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [fixedMajor, setFixedMajor] = useState(
    taxSettings.fixedMonthlyMinor !== null
      ? minorToMajor(taxSettings.fixedMonthlyMinor, reportingCurrency)
      : ''
  );
  const [marginalPercent, setMarginalPercent] = useState(
    taxSettings.marginalRateBps !== null
      ? String(taxSettings.marginalRateBps / 100)
      : ''
  );

  const today = new Date().toISOString().slice(0, 10);
  const month = currentMonth();

  const fixedMinor = majorToMinor(fixedMajor || '0', reportingCurrency);
  const marginalBps =
    marginalPercent === '' ? null : Math.round(Number(marginalPercent) * 100);
  const hasValidInputs =
    fixedMinor !== null &&
    marginalBps !== null &&
    Number.isFinite(marginalBps) &&
    marginalBps >= 0 &&
    marginalBps <= 9999;

  const derivation = useMemo(() => {
    if (!hasValidInputs || fixedMinor === null || marginalBps === null) {
      return null;
    }
    return solveTargetRate(
      obligations,
      obligationSchedules,
      dailyExpenses,
      incomeStreams,
      month,
      calendar,
      reportingCurrency,
      rates,
      today,
      fixedMinor,
      marginalBps
    );
  }, [
    hasValidInputs,
    fixedMinor,
    marginalBps,
    obligations,
    obligationSchedules,
    dailyExpenses,
    incomeStreams,
    month,
    calendar,
    reportingCurrency,
    rates,
    today,
  ]);

  const noHolidaysConfigured = calendar.holidays.length === 0;

  function handleSave() {
    if (!hasValidInputs || fixedMinor === null || marginalBps === null) {
      toast.error(t('checkTaxFields'));
      return;
    }
    startTransition(async () => {
      const res = await setHorizonTaxSettings({
        fixedMonthlyMinor: fixedMinor,
        marginalRateBps: marginalBps,
      });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success(t('settingsSaved'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t('taxPolicyTitle')}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {t('taxPolicyDescription')}
          </p>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">{t('fixedMonthlyLabel')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={fixedMajor}
              onChange={(e) => setFixedMajor(e.target.value)}
              className="w-32 rounded border border-sand-300 px-2 py-1 text-right"
              aria-label={t('fixedMonthlyLabel')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">{t('marginalRateLabel')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={marginalPercent}
              onChange={(e) => setMarginalPercent(e.target.value)}
              className="w-24 rounded border border-sand-300 px-2 py-1 text-right"
              aria-label={t('marginalRateLabel')}
            />
          </label>
          <button
            type="button"
            disabled={isPending || !hasValidInputs}
            onClick={handleSave}
            className="self-end rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t('save')}
          </button>
        </div>
      </section>

      {noHolidaysConfigured && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {t('noHolidaysWarning')}
        </div>
      )}

      {!hasValidInputs && (
        <p className="text-sm text-text-muted">{t('setTaxPolicyPrompt')}</p>
      )}

      {derivation && (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {t('requiredRateTitle')}
            </h2>
            <p className="mt-2 text-3xl font-semibold text-text-primary">
              {derivation.requiredHourlyRateMinor !== null
                ? formatMoney(
                    derivation.requiredHourlyRateMinor,
                    reportingCurrency,
                    { withCurrency: true }
                  )
                : t('noHoursAvailable')}
            </p>
            {derivation.hasMissingRate && (
              <p className="mt-1 text-sm text-amber-700">
                {t('missingRateWarning')}
              </p>
            )}
          </div>

          <p className="text-sm text-text-muted">
            {t('costPerNetUnit', {
              rate: derivation.costPerNetUnit.toFixed(2),
            })}
          </p>

          <details className="rounded border border-gray-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm text-gray-600 hover:bg-gray-50">
              {t('derivationTitle')}
            </summary>
            <dl className="space-y-1 border-t border-gray-200 px-4 py-3 text-xs">
              <Row
                label={t('derivation.commitmentTotal')}
                value={formatMoney(
                  derivation.commitmentTotalMinor,
                  reportingCurrency,
                  { withCurrency: true }
                )}
              />
              <Row
                label={t('derivation.fixedMonthlyTax')}
                value={formatMoney(
                  derivation.fixedMonthlyTaxMinor,
                  reportingCurrency,
                  { withCurrency: true }
                )}
              />
              <Row
                label={t('derivation.marginalRate')}
                value={`${(derivation.marginalRateBps / 100).toFixed(2)}%`}
              />
              <Row
                label={t('derivation.grossRequired')}
                value={formatMoney(
                  derivation.grossRequiredMinor,
                  reportingCurrency,
                  { withCurrency: true }
                )}
              />
              <Row
                label={t('derivation.billableHours')}
                value={derivation.billableHours.toFixed(1)}
              />
            </dl>
          </details>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-mono text-gray-900">{value}</dd>
    </div>
  );
}
