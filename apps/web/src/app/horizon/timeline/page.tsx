import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { verifySession, getHouseholdId } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getHorizonAccounts } from '@/lib/horizon/queries/accounts';
import {
  getIncomeStreams,
  getIncomeSchedules,
  getWorkCalendar,
  getHolidays,
} from '@/lib/horizon/queries/income';
import {
  getObligations,
  getObligationSchedules,
  getDailyExpenses,
  getOneOffEvents,
} from '@/lib/horizon/queries/spending';
import { getHorizonFxRates } from '@/lib/horizon/queries/fx';
import { getHorizonSettings } from '@/lib/horizon/queries/settings';
import { projectCashflow } from '@/lib/horizon/projection/projection';
import { parseProjectionRange } from './parseProjectionRange';
import { BalanceLineChart } from '@/components/horizon/timeline/BalanceLineChart';
import { ProjectionTable } from '@/components/horizon/timeline/ProjectionTable';
import { MonthPairTable } from '@/components/horizon/timeline/MonthPairTable';
import { RangeControl } from '@/components/horizon/timeline/RangeControl';
import { ViewToggle } from '@/components/horizon/timeline/ViewToggle';
import { StaleRateBanner } from '@/components/horizon/timeline/StaleRateBanner';

export default async function HorizonTimelinePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [
    accounts,
    streams,
    incomeSchedules,
    obligations,
    obligationSchedules,
    dailyExpenses,
    oneOffs,
    rates,
    calendar,
    holidays,
    settings,
  ] = await Promise.all([
    getHorizonAccounts(supabase, householdId),
    getIncomeStreams(supabase, householdId),
    getIncomeSchedules(supabase, householdId),
    getObligations(supabase, householdId),
    getObligationSchedules(supabase, householdId),
    getDailyExpenses(supabase, householdId),
    getOneOffEvents(supabase, householdId),
    getHorizonFxRates(supabase),
    getWorkCalendar(supabase, householdId),
    getHolidays(supabase, householdId),
    getHorizonSettings(supabase, householdId),
  ]);

  const { from, to, view } = parseProjectionRange(searchParams, todayStr);

  const projection = projectCashflow(
    {
      accounts,
      streams,
      incomeSchedules,
      obligations,
      obligationSchedules,
      dailyExpenses,
      oneOffs,
      rates,
      calendar: {
        workingWeekdays: calendar.workingWeekdays,
        holidays: holidays.map((holiday) => holiday.date),
      },
    },
    {
      from,
      to,
      today: todayStr,
      reportingCurrency: settings.reportingCurrency,
      order: settings.eventOrder,
    }
  );

  const t = await getTranslations('Horizon.timeline');

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl">{t('title')}</h1>
      </div>

      <StaleRateBanner
        oldestRateAsOfDate={projection.oldestRateAsOfDate}
        today={todayStr}
      />

      <div className="space-y-2">
        <h2 className="font-semibold">{t('rangeLabel')}</h2>
        <RangeControl from={from} />
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">{t('viewLabel')}</h2>
        <ViewToggle current={view} from={from} to={to} />
      </div>

      {view === 'line' && (
        <div className="space-y-2">
          <div className="rounded bg-white p-4 shadow">
            <BalanceLineChart
              dailyBalances={projection.dailyBalances}
              events={projection.events}
              reportingCurrency={settings.reportingCurrency}
            />
          </div>
          <div className="text-xs text-ink-muted">
            <p>{t('openingBalanceLabel')}</p>
            <p className="mt-1">{t('openingBalanceNote')}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="font-semibold">
          {view === 'line' ? t('monthSummary') : t('eventDetails')}
        </h2>
        <div className="rounded bg-white p-4 shadow overflow-x-auto">
          {view === 'line' || view === 'waterfall' ? (
            <MonthPairTable
              monthPoints={projection.monthPoints}
              reportingCurrency={settings.reportingCurrency}
            />
          ) : (
            <ProjectionTable
              events={projection.events}
              reportingCurrency={settings.reportingCurrency}
            />
          )}
        </div>
      </div>
    </div>
  );
}
