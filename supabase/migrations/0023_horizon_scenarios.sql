-- Horizon Epic E — named scenarios as sets of dated diffs on the baseline.
-- No baseline row is stored: "baseline" is the live income/spending data
-- with zero diffs applied, never a duplicate. See docs/horizon-user-stories.md
-- Epic E. Additive and backward compatible.

create table public.horizon_scenarios (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint horizon_scenarios_name_len
    check (char_length(btrim(name)) between 1 and 60)
);
create index horizon_scenarios_household_idx
  on public.horizon_scenarios (household_id);

create trigger horizon_scenarios_touch_updated_at
  before update on public.horizon_scenarios
  for each row execute function public.set_updated_at();

alter table public.horizon_scenarios enable row level security;

create policy "horizon_scenarios_select" on public.horizon_scenarios for select using (public.is_household_member(household_id));
create policy "horizon_scenarios_insert" on public.horizon_scenarios for insert with check (public.is_household_member(household_id));
create policy "horizon_scenarios_update" on public.horizon_scenarios for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_scenarios_delete" on public.horizon_scenarios for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_scenarios to authenticated;
grant select, insert, update, delete on public.horizon_scenarios to service_role;

-- One row per overridden field per entity. `field='archived'` on an income
-- stream implements B5's on/off toggle "within a scenario"; other fields
-- (hourlyRateMinor, hoursPerDay, fixedAmountMinor, amountMinor,
-- dailyAmountMinor, capMinor) implement E1's inline what-ifs. `effective_date`
-- is stored now, unused until E4 (P2), to avoid a later migration.
create table public.horizon_scenario_diffs (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  scenario_id     uuid not null references public.horizon_scenarios(id) on delete cascade,
  entity_type     text not null,  -- incomeStream | obligation | dailyExpense
  entity_id       uuid not null,
  field           text not null,
  value_json      jsonb not null,
  effective_date  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint horizon_scenario_diffs_entity_type_allowed
    check (entity_type in ('incomeStream','obligation','dailyExpense')),
  constraint horizon_scenario_diffs_field_len
    check (char_length(btrim(field)) between 1 and 60),
  constraint horizon_scenario_diffs_unique_target
    unique (scenario_id, entity_type, entity_id, field)
);
create index horizon_scenario_diffs_household_idx
  on public.horizon_scenario_diffs (household_id);
create index horizon_scenario_diffs_scenario_idx
  on public.horizon_scenario_diffs (scenario_id);

create trigger horizon_scenario_diffs_touch_updated_at
  before update on public.horizon_scenario_diffs
  for each row execute function public.set_updated_at();

alter table public.horizon_scenario_diffs enable row level security;

create policy "horizon_scenario_diffs_select" on public.horizon_scenario_diffs for select using (public.is_household_member(household_id));
create policy "horizon_scenario_diffs_insert" on public.horizon_scenario_diffs for insert with check (public.is_household_member(household_id));
create policy "horizon_scenario_diffs_update" on public.horizon_scenario_diffs for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_scenario_diffs_delete" on public.horizon_scenario_diffs for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_scenario_diffs to authenticated;
grant select, insert, update, delete on public.horizon_scenario_diffs to service_role;

-- Scenario-scoped one-off events (D13: a transition carries its own dated
-- one-off costs and refunds). Same shape as horizon_one_off_events plus
-- scenario_id.
create table public.horizon_scenario_one_offs (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  scenario_id    uuid not null references public.horizon_scenarios(id) on delete cascade,
  account_id     uuid not null references public.horizon_accounts(id) on delete cascade,
  name           text not null,
  category       text not null,
  amount_minor   bigint not null,
  currency       text not null,
  date           date not null,
  direction      text not null,   -- in | out
  created_at     timestamptz not null default now(),
  constraint horizon_scenario_one_offs_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_scenario_one_offs_direction_allowed
    check (direction in ('in','out')),
  constraint horizon_scenario_one_offs_category_allowed
    check (category in ('housing','utilities','debt','subscriptions','insurance',
                         'transport','family','gift','bonus','other')),
  constraint horizon_scenario_one_offs_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint horizon_scenario_one_offs_amount_positive
    check (amount_minor > 0)
);
create index horizon_scenario_one_offs_household_idx
  on public.horizon_scenario_one_offs (household_id, date);
create index horizon_scenario_one_offs_scenario_idx
  on public.horizon_scenario_one_offs (scenario_id);

alter table public.horizon_scenario_one_offs enable row level security;

create policy "horizon_scenario_one_offs_select" on public.horizon_scenario_one_offs for select using (public.is_household_member(household_id));
create policy "horizon_scenario_one_offs_insert" on public.horizon_scenario_one_offs for insert with check (public.is_household_member(household_id));
create policy "horizon_scenario_one_offs_update" on public.horizon_scenario_one_offs for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_scenario_one_offs_delete" on public.horizon_scenario_one_offs for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_scenario_one_offs to authenticated;
grant select, insert, update, delete on public.horizon_scenario_one_offs to service_role;
