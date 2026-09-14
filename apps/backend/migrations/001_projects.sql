-- A project is one source video turned into clips; its row is also the job the worker runs.
create table projects (
    id               uuid primary key default gen_random_uuid(),
    source           text not null,
    options          jsonb not null,
    status           text not null default 'queued' check (status in
                         ('queued', 'downloading', 'transcribing', 'analyzing', 'rendering',
                          'completed', 'failed', 'cancelled')),
    detail           text not null default '',
    error            text,
    source_key       text,
    attempts         int not null default 0,
    max_attempts     int not null default 3,
    run_after        timestamptz not null default now(),
    cancel_requested boolean not null default false,
    heartbeat_at     timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    finished_at      timestamptz
);
create index projects_queue on projects (created_at) where status = 'queued';
create index projects_running on projects (heartbeat_at)
    where status in ('downloading', 'transcribing', 'analyzing', 'rendering');

-- Transcripts are cached by source (e.g. Youtube-<id> or a file hash) so a video is never paid for twice.
create table transcripts (
    source_key text primary key,
    language   text,
    data       jsonb not null,
    created_at timestamptz not null default now()
);

create table clips (
    project_id  uuid not null references projects on delete cascade,
    idx         int not null,
    start_s     double precision not null,
    end_s       double precision not null,
    score       int not null,
    reason      text not null,
    hook        text not null,
    title       text not null,
    description text not null,
    hashtags    jsonb not null,
    posts       jsonb not null,
    primary key (project_id, idx)
);
