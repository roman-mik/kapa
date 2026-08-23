-- Horizon Epic D — durable projection state: negative-day dismissals (§5-D3)
-- and the configurable same-day event order (§5-D4). The projection itself is
-- computed, never stored. See docs/horizon-epic-d-plan.md §2. Additive and
-- backward compatible.

create table public.horizon_projection_dismissals (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  negative_date    date not null,
  -- The shortfall as a positive magnitude, in the reporting currency at the
  -- moment of dismissal. Stored so a WORSENING shortfall on an already
  -- dismissed date re-surfaces instead of staying hidden.
  shortfall_minor  bigint not null,
  currency         text not null,
  reason           text not null,
  created_at       timestamptz not null default now(),
  constraint horizon_projection_dismissals_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_projection_dismissals_shortfall_positive
    check (shortfall_minor > 0),
  constraint horizon_projection_dismissals_reason_len
    check (char_length(btrim(reason)) between 1 and 500),
  constraint horizon_projection_dismissals_unique_date
    unique (household_id, negative_date)
);

alter table public.horizon_projection_dismissals enable row level security;

create policy "horizon_projection_dismissals_select" on public.horizon_projection_dismissals for select using (public.is_household_member(household_id));
create policy "horizon_projection_dismissals_insert" on public.horizon_projection_dismissals for insert with check (public.is_household_member(household_id));
create policy "horizon_projection_dismissals_update" on public.horizon_projection_dismissals for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_projection_dismissals_delete" on public.horizon_projection_dismissals for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_projection_dismissals to authenticated;
grant select, insert, update, delete on public.horizon_projection_dismissals to service_role;

alter table public.households add column horizon_event_order text;
update public.households
  set horizon_event_order = 'income,oneOffIn,obligation,dailyExpense,oneOffOut';
alter table public.households
  alter column horizon_event_order set not null,
  alter column horizon_event_order set default 'income,oneOffIn,obligation,dailyExpense,oneOffOut',
  -- Containment plus an exact length is a permutation check without a
  -- subquery (checks can't contain subqueries). string_to_array is immutable.
  add constraint households_horizon_event_order_valid
    check (
      string_to_array(horizon_event_order, ',')
        @> array['income','oneOffIn','obligation','dailyExpense','oneOffOut']
      and array_length(string_to_array(horizon_event_order, ','), 1) = 5
    );
