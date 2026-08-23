-- pgTAP RLS isolation suite for horizon_projection_dismissals (0022_horizon_projection.sql).
-- Run with: supabase test db
--
-- Tests RLS policies, check constraints, and the upsert behavior.

begin;

create schema if not exists tests;
grant usage on schema tests to authenticated;
create or replace function tests.login_as(uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$ language plpgsql;
create or replace function tests.logout() returns void as $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('request.jwt.claim.sub', null, true);
  execute 'reset role';
end $$ language plpgsql;
grant execute on function tests.login_as(uuid) to authenticated;
grant execute on function tests.logout() to authenticated;

select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

select gen_random_uuid() as alice_id \gset
select gen_random_uuid() as bob_id \gset

insert into public.allowed_emails (email) values
  ('pgtap-projection-alice@example.com'), ('pgtap-projection-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-projection-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-projection-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset
select household_id as bob_household from public.household_members where user_id = :'bob_id' \gset

-- Insert a test dismissal for alice's household
insert into public.horizon_projection_dismissals
  (household_id, negative_date, shortfall_minor, currency, reason)
  values (:'alice_household', '2026-01-15', 50000, 'RSD', 'Planned expense');

-- ---------------------------------------------------------------------------
-- Check constraints.
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.horizon_projection_dismissals
            (household_id, negative_date, shortfall_minor, currency, reason)
            values (%L, '2026-01-20', 0, 'RSD', 'Bad shortfall') $$,
    :'alice_household'),
  '23514', null,
  'a zero shortfall violates the check constraint');

select throws_ok(
  format($$ insert into public.horizon_projection_dismissals
            (household_id, negative_date, shortfall_minor, currency, reason)
            values (%L, '2026-01-20', -1000, 'RSD', 'Bad shortfall') $$,
    :'alice_household'),
  '23514', null,
  'a negative shortfall violates the check constraint');

select throws_ok(
  format($$ insert into public.horizon_projection_dismissals
            (household_id, negative_date, shortfall_minor, currency, reason)
            values (%L, '2026-01-20', 1000, 'XXX', 'Bad currency') $$,
    :'alice_household'),
  '23514', null,
  'an unsupported currency violates the check constraint');

select throws_ok(
  format($$ insert into public.horizon_projection_dismissals
            (household_id, negative_date, shortfall_minor, currency, reason)
            values (%L, '2026-01-20', 1000, 'RSD', '   ') $$,
    :'alice_household'),
  '23514', null,
  'a blank reason violates the check constraint');

select throws_ok(
  format($$ insert into public.horizon_projection_dismissals
            (household_id, negative_date, shortfall_minor, currency, reason)
            values (%L, '2026-01-20', 1000, 'RSD', %L) $$,
    :'alice_household',
    repeat('x', 501)),
  '23514', null,
  'a reason longer than 500 characters violates the check constraint');

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's dismissals.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.horizon_projection_dismissals where household_id = :'alice_household'),
  1, 'alice sees her own household dismissal');

select lives_ok(
  format($$ insert into public.horizon_projection_dismissals
            (household_id, negative_date, shortfall_minor, currency, reason)
            values (%L, '2026-02-10', 75000, 'EUR', 'Upcoming deadline') $$,
    :'alice_household'),
  'alice can insert a dismissal into her own household');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's dismissals are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.horizon_projection_dismissals where household_id = :'alice_household'),
  0, 'bob sees zero dismissals from alice''s household');

select throws_ok(
  format($$ insert into public.horizon_projection_dismissals
            (household_id, negative_date, shortfall_minor, currency, reason)
            values (%L, '2026-03-01', 100000, 'RSD', 'Not allowed') $$,
    :'alice_household'),
  '42501', null,
  'bob cannot insert into alice''s household');

-- ---------------------------------------------------------------------------
-- Unique constraint on (household_id, negative_date).
-- ---------------------------------------------------------------------------

select tests.logout();
select tests.login_as(:'alice_id');

select lives_ok(
  format($$ insert into public.horizon_projection_dismissals
            (household_id, negative_date, shortfall_minor, currency, reason)
            values (%L, '2026-01-15', 60000, 'RSD', 'Updated reason')
            on conflict (household_id, negative_date) do update set
            shortfall_minor = 60000, reason = 'Updated reason' $$,
    :'alice_household'),
  'alice can upsert on the same date (replaces the old dismissal)');

select is(
  (select count(*)::int from public.horizon_projection_dismissals
   where household_id = :'alice_household' and negative_date = '2026-01-15'),
  1, 'the upsert does not create a duplicate');

-- ---------------------------------------------------------------------------
-- Cascade delete: deleting a household deletes its dismissals.
-- authenticated cannot delete households (only service_role can), so we test
-- via direct deletion at the SQL level (the RLS is bypassed).
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.horizon_projection_dismissals where household_id = :'alice_household'),
  2, 'alice has 2 dismissals before cascade delete');

set role to service_role;
delete from public.households where id = :'alice_household';
set role to authenticated;

select is(
  (select count(*)::int from public.horizon_projection_dismissals where household_id = :'alice_household'),
  0, 'dismissals cascade-deleted when household is deleted');

select finish();

rollback;
