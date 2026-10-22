-- Events (founder, 2026-10-22) are meetups with kind = 'event'. Postgres can't use a new enum value in the transaction
-- that adds it, so the value gets its own migration; *_events.sql builds on it.

alter type public.meetup_kind add value if not exists 'event';
