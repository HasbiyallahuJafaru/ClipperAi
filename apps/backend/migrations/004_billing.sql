-- Plan history for the workspace. One row per plan chosen; at most one active at a time.
-- Accounts come later (Phase 9): then each row gets a user id and the unique index becomes per user.
create table subscriptions (
    id            uuid primary key default gen_random_uuid(),
    plan          text not null,
    price_cents   int not null,            -- the plan's monthly list price when it was chosen
    charged_cents int not null default 0,  -- what was actually taken: 0 while payments are switched off
    status        text not null default 'active' check (status in ('active', 'ended')),
    started_at    timestamptz not null default now(),
    ended_at      timestamptz
);
create unique index subscriptions_one_active on subscriptions ((true)) where status = 'active';
