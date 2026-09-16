-- The source video's own title (e.g. the YouTube title), filled in by the worker during download, so the UI can
-- show a name instead of the pasted URL. Uploads keep the filename in `source` and may leave this empty.
alter table projects add column if not exists source_title text;
