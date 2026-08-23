import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { verifySession, getHouseholdId } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  getObligations,
  getObligationSchedules,
  getDailyExpenses,
} from '@/lib/horizon/queries/spending';
import {
  getIncomeStreams,
  getWorkCalendar,
  getHolidays,
} from '@/lib/horizon/queries/income';
import { getHorizonFxRates } from '@/lib/horizon/queries/fx';
import {
  getHorizonSettings,
  getHorizonTaxSettings,
} from '@/lib/horizon/queries/settings';
import { TargetRateApp } from '@/components/horizon/target-rate/TargetRateApp';

export default async function HorizonTargetRatePage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();

  const [
    obligations,
    obligationSchedules,
    dailyExpenses,
    incomeStreams,
    calendar,
    holidays,
    rates,
    settings,
    taxSettings,
  ] = await Promise.all([
    getObligations(supabase, householdId),
    getObligationSchedules(supabase, householdId),
    getDailyExpenses(supabase, householdId),
    getIncomeStreams(supabase, householdId),
    getWorkCalendar(supabase, householdId),
    getHolidays(supabase, householdId),
    getHorizonFxRates(supabase),
    getHorizonSettings(supabase, householdId),
    getHorizonTaxSettings(supabase, householdId),
  ]);

  const t = await getTranslations('Horizon.targetRate');

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl">{t('title')}</h1>
      <div className="mt-6">
        <TargetRateApp
          obligations={obligations}
          obligationSchedules={obligationSchedules}
          dailyExpenses={dailyExpenses}
          incomeStreams={incomeStreams}
          calendar={{
            workingWeekdays: calendar.workingWeekdays,
            holidays: holidays.map((h) => h.date),
          }}
          reportingCurrency={settings.reportingCurrency}
          rates={rates}
          taxSettings={taxSettings}
        />
      </div>
    </div>
  );
}
