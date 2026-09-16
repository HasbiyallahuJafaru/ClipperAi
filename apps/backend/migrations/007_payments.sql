-- One row per attempt at buying 30 days of a plan. `applied_at` is the once-per-reference lock: the update that
-- sets it is the only code path that activates a plan, so duplicate callbacks and reconciliation can't double-apply.
create table if not exists payments (
    reference  text primary key,
    owner      text not null,
    plan       text not null,
    email      text not null,
    usd_cents  int  not null,
    kobo       bigint not null,
    rate       numeric not null,
    status     text not null default 'pending' check (status in ('pending', 'success', 'failed')),
    applied_at timestamptz,
    created_at timestamptz not null default now()
);

-- Each payment buys 30 days; an expired subscription behaves like a cancelled one.
alter table subscriptions add column if not exists expires_at timestamptz;
update subscriptions set expires_at = now() + interval '30 days'
    where status = 'active' and expires_at is null;

-- One row: the USD->NGN rate used to price a charge in kobo, refreshed daily (payments.rate()).
create table if not exists fx_rate (
    id     int primary key check (id = 1),
    rate   numeric not null,
    at     timestamptz not null default now()
);
insert into fx_rate (id, rate) values (1, 1600) on conflict (id) do nothing;
