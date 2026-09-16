-- Per-user publishing connections. Provider 'buffer' today; direct platform APIs (linkedin, youtube, threads) can
-- reuse the table later. One active connection per owner+provider (same partial-unique-index pattern as plans).
create table if not exists connected_accounts (
    id            uuid primary key default gen_random_uuid(),
    owner         text not null,
    provider      text not null check (provider in ('buffer', 'linkedin', 'youtube', 'threads')),
    account_id    text not null,
    account_name  text not null,
    access_token  text not null,
    refresh_token text,
    expires_at    timestamptz not null default now() + interval '55 minutes',
    created_at    timestamptz not null default now()
);
create unique index if not exists connected_accounts_one_active
    on connected_accounts (owner, provider);

-- Single-use handshake rows for the OAuth "connect" flows; each is good for ten minutes and one use.
create table if not exists oauth_states (
    state      text primary key,
    owner      text not null,
    provider   text not null check (provider in ('buffer', 'linkedin', 'youtube', 'threads')),
    verifier   text not null,  -- PKCE code_verifier, revealed only to the token endpoint
    created_at timestamptz not null default now()
);
