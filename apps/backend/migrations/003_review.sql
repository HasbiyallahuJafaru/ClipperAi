-- Clip review: users approve or reject clips; edited copy (title, description, hashtags, posts) overwrites the draft.
alter table clips add column review text not null default 'pending'
    check (review in ('pending', 'approved', 'rejected'));
