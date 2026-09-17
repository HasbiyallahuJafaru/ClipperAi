-- Projects are soft-deleted: the row stays so this month's usage (hours, clips, videos) survives deletion —
-- otherwise deleting a project would refund the allowance it consumed. Files and clips still go.
alter table projects add column if not exists deleted_at timestamptz;
