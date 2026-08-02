-- Migration: import real Google reviews per-restaurant, lazily.
--
-- Run this in the Supabase SQL editor after 001_live_data_and_ratings.sql.
-- Additive and safe to re-run.
--
-- What changed and why: restaurant discovery stays on the free Overpass
-- path (see server/utils/overpass.js), but when a user opens a specific
-- restaurant's detail page, the server now makes one billed Google Places
-- call to pull that restaurant's real Google reviews and imports them as
-- ordinary rows in `reviews`, tagged source='google'. They then flow
-- through the exact same sentiment analysis, complaint detection, summary
-- card, and analytics dashboard as any DineIQ-native review -- no
-- parallel code path. This mirrors Phase 20.3 of the build guide (source
-- + external_id, so a review already imported doesn't get duplicated on a
-- later visit).

alter table reviews
  alter column user_id drop not null;

alter table reviews
  add column if not exists source      text not null default 'user',
  add column if not exists external_id text,
  add column if not exists author_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_source_check'
  ) then
    alter table reviews
      add constraint reviews_source_check check (source in ('user', 'google'));
  end if;
end $$;

-- A plain (non-partial) unique constraint: Postgres never treats two NULLs
-- as equal, so this still allows unlimited DineIQ-native reviews with a
-- null external_id -- it only enforces uniqueness among rows that have
-- one. A *partial* index (where external_id is not null) looks more
-- precise but Postgres won't use it as an ON CONFLICT target unless the
-- query repeats that same WHERE clause, which PostgREST's upsert doesn't
-- do -- it fails with "no unique or exclusion constraint matching the ON
-- CONFLICT specification". This is the simpler thing that actually works.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_external_id_key'
  ) then
    alter table reviews add constraint reviews_external_id_key unique (external_id);
  end if;
end $$;

alter table restaurants
  add column if not exists google_place_id     text,
  add column if not exists google_rating       numeric(2, 1),
  add column if not exists google_review_count int,
  add column if not exists google_synced_at    timestamptz;
