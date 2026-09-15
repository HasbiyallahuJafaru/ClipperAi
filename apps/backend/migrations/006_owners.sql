-- Accounts come from Clerk. Projects (and through them clips and posts) and plans belong to an owner: the person's
-- active Clerk organization id (org_...) or, without one, their Clerk user id (user_...). Rows from before sign-in
-- have no owner, so nobody sees them.
alter table projects add column owner text;
create index projects_by_owner on projects (owner, created_at desc);

alter table subscriptions add column owner text;
drop index subscriptions_one_active;
create unique index subscriptions_one_active on subscriptions (owner) where status = 'active';
