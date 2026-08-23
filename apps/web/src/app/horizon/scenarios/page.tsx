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
import {
  getAllScenarioDiffs,
  getAllScenarioOneOffs,
  getScenarios,
} from '@/lib/horizon/queries/scenarios';
import { addDays } from '@/lib/horizon/schedule';
import { ScenariosApp } from '@/components/horizon/scenarios/ScenariosApp';
import type {
  ScenarioDiff,
  ScenarioOneOff,
} from '@/lib/horizon/scenarios/types';

function groupBy<T, K extends string>(
  items: T[],
  key: (item: T) => K
): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (result[k] ??= []).push(item);
  }
  return result;
}

export default async function HorizonScenariosPage() {
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
    scenarios,
    allDiffs,
    allScenarioOneOffs,
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
    getScenarios(supabase, householdId),
    getAllScenarioDiffs(supabase, householdId),
    getAllScenarioOneOffs(supabase, householdId),
  ]);

  const diffsByScenario = groupBy(allDiffs, (d: ScenarioDiff) => d.scenarioId);
  const oneOffsByScenario = groupBy(
    allScenarioOneOffs,
    (o: ScenarioOneOff) => o.scenarioId
  );

  const t = await getTranslations('Horizon.scenarios');

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="font-heading text-2xl">{t('title')}</h1>

      <ScenariosApp
        scenarios={scenarios}
        diffsByScenario={diffsByScenario}
        oneOffsByScenario={oneOffsByScenario}
        inputs={{
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
        }}
        options={{
          from: todayStr,
          to: addDays(todayStr, 365),
          today: todayStr,
          reportingCurrency: settings.reportingCurrency,
          order: settings.eventOrder,
        }}
      />
    </div>
  );
}
