-- Migration: restaurant discovery moves from free Overpass to Google
-- Places Nearby Search (New), with Overpass kept only as a fallback.
--
-- Run this in the Supabase SQL editor after 001 and 002. Additive/safe to
-- re-run.
--
-- What changed and why: GET /api/restaurants/nearby now upserts results
-- from Google Places Nearby Search, keyed on google_place_id, the same
-- way it previously upserted Overpass results keyed on osm_id. Both
-- columns coexist on the same table -- a restaurant discovered via Google
-- has osm_id null, one discovered via Overpass (or matched later by the
-- per-restaurant review importer) has google_place_id set instead, or
-- both if it was found by one and later matched to the other.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_google_place_id_key'
  ) then
    alter table restaurants add constraint restaurants_google_place_id_key unique (google_place_id);
  end if;
end $$;

-- 'source' previously only allowed osm/manual; Google-discovered
-- restaurants need their own value.
alter table restaurants drop constraint if exists restaurants_source_check;
alter table restaurants add constraint restaurants_source_check check (source in ('osm', 'google', 'manual'));

-- Purges the original hand-seeded demo rows (from before any live-data
-- sync existed): anything with neither an osm_id nor a google_place_id
-- was never discovered by a real source. Reviews/favourites on these rows
-- cascade-delete with them.
delete from restaurants where osm_id is null and google_place_id is null;

-- Adds google_rating/google_review_count to the nearby-search response.
-- Nearby Search (New) returns these for free alongside every result, so a
-- freshly-discovered restaurant with zero DineIQ reviews can still show a
-- real rating instead of "New" -- the frontend prefers this over the
-- avg_rating/review_count columns (DineIQ's own reviews) when present.
-- Same reason as migration 001: CREATE OR REPLACE can't change a
-- function's return columns, only its body, so the old signature has to
-- be dropped first. "if exists" makes this safe to re-run.
drop function if exists nearby_restaurants(double precision, double precision, double precision, text, smallint);

create function nearby_restaurants(
  lat double precision,
  long double precision,
  radius_km double precision,
  cuisine_filter text default null,
  price_level_filter smallint default null
)
returns table (
  id                  uuid,
  name                text,
  cuisine             text,
  price_level         smallint,
  latitude            double precision,
  longitude           double precision,
  address             text,
  phone               text,
  website             text,
  opening_hours       text,
  created_at          timestamptz,
  distance_km         double precision,
  avg_rating          numeric,
  review_count        bigint,
  google_rating       numeric,
  google_review_count int
)
language sql
stable
as $$
  select
    r.id,
    r.name,
    r.cuisine,
    r.price_level,
    r.latitude,
    r.longitude,
    r.address,
    r.phone,
    r.website,
    r.opening_hours,
    r.created_at,
    ST_Distance(
      r.location,
      ST_SetSRID(ST_MakePoint(long, lat), 4326)::geography
    ) / 1000 as distance_km,
    round(rv.avg_rating, 1) as avg_rating,
    coalesce(rv.review_count, 0) as review_count,
    r.google_rating,
    r.google_review_count
  from restaurants r
  left join (
    select restaurant_id, avg(rating) as avg_rating, count(*) as review_count
    from reviews
    group by restaurant_id
  ) rv on rv.restaurant_id = r.id
  where ST_DWithin(
    r.location,
    ST_SetSRID(ST_MakePoint(long, lat), 4326)::geography,
    radius_km * 1000
  )
  and (cuisine_filter is null or r.cuisine = cuisine_filter)
  and (price_level_filter is null or r.price_level = price_level_filter)
  order by distance_km asc;
$$;
