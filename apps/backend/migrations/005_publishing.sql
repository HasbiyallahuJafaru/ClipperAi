-- A clip sent to one Buffer channel. Rows are written before Buffer is asked, so a double submit can't post twice;
-- status then follows Buffer's post (scheduled, sending, sent, error, ...). Failed attempts stay visible as 'error'.
create table publications (
    id             uuid primary key default gen_random_uuid(),
    project_id     uuid not null,
    clip_idx       int not null,
    channel_id     text not null,
    service        text not null,           -- Buffer's name for the network: tiktok, instagram, youtube, twitter...
    channel_name   text not null,
    buffer_post_id text,
    status         text not null default 'sending',
    due_at         timestamptz,             -- null: posted straight away
    sent_at        timestamptz,
    external_link  text,
    error          text,
    created_at     timestamptz not null default now(),
    checked_at     timestamptz not null default now(),
    foreign key (project_id, clip_idx) references clips on delete cascade
);
create unique index publications_once_per_channel on publications (project_id, clip_idx, channel_id)
    where status <> 'error';
