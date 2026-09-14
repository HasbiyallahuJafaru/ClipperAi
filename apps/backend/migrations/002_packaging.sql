-- 'packaging' = uploading the rendered clips to object storage.
alter table projects drop constraint projects_status_check;
alter table projects add constraint projects_status_check check (status in
    ('queued', 'downloading', 'transcribing', 'analyzing', 'rendering', 'packaging',
     'completed', 'failed', 'cancelled'));
