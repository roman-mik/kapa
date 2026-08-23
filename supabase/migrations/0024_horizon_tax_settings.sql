-- Horizon Epic F — household-level tax policy for target-rate solving (F1/F3).
-- A single fixed + marginal policy, not a `horizon_tax_rules` table: the
-- spec's `TaxRule.appliesToStreamIds[]` is unneeded because
-- `horizon_income_streams.taxable` (Epic B) already selects per stream.
-- Follows the `horizon_reporting_currency`/`horizon_event_order` precedent
-- (0014/0022) of a plain nullable column on `households` for a single
-- household-wide setting. Both columns stay nullable — an unconfigured
-- household simply can't produce a solve yet, no default guess (D14).
-- Additive and backward compatible. See docs/horizon-user-stories.md Epic F.

alter table public.households
  add column horizon_tax_fixed_monthly_minor bigint,
  add column horizon_tax_marginal_rate_bps integer;

alter table public.households
  add constraint households_horizon_tax_fixed_monthly_nonnegative
    check (horizon_tax_fixed_monthly_minor is null or horizon_tax_fixed_monthly_minor >= 0),
  add constraint households_horizon_tax_marginal_rate_range
    check (
      horizon_tax_marginal_rate_bps is null
      or horizon_tax_marginal_rate_bps between 0 and 9999
    );
