-- Migration: live-data columns + rating aggregate in nearby_restaurants.
--
-- Run this in the Supabase SQL editor if you already ran the original
-- supabase/schema.sql and don't want to drop your tables. It's additive
-- and safe to re-run (IF NOT EXISTS / CREATE OR REPLACE throughout).
--
-- What changed and why: restaurants used to be populated by hand or by a
-- one-off seed script. They're now discovered live from OpenStreetMap's
-- Overpass API on every search (server/utils/overpass.js) and upserted
-- here, keyed on osm_id so the same place found again updates the
-- existing row instead of duplicating it. See Phase 19 of the build guide
-- for the general pattern this follows.

alter table restaurants
  add column if not exists osm_id         text,
  add column if not exists phone          text,
  add column if not exists website        text,
  add column if not exists opening_hours  text,
  add column if not exists source         text not null default 'osm',
  add column if not exists last_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_osm_id_key'
  ) then
    alter table restaurants add constraint restaurants_osm_id_key unique (osm_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_source_check'
  ) then
    alter table restaurants
      add constraint restaurants_source_check check (source in ('osm', 'manual'));
  end if;
end $$;

-- Replaces the version in schema.sql: same distance search, now also
-- joining in a live rating aggregate and the live-data contact fields.
--
-- Postgres won't let CREATE OR REPLACE change a function's return columns
-- (the old version returned 9 columns, this one returns 13) -- it has to
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
  id            uuid,
  name          text,
  cuisine       text,
  price_level   smallint,
  latitude      double precision,
  longitude     double precision,
  address       text,
  phone         text,
  website       text,
  opening_hours text,
  created_at    timestamptz,
  distance_km   double precision,
  avg_rating    numeric,
  review_count  bigint
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
    coalesce(rv.review_count, 0) as review_count
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
