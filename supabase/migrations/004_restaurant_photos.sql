-- Migration: real restaurant photos, re-hosted from Google Places.
--
-- Run this in the Supabase SQL editor after 001-003. Additive/safe to re-run.
--
-- What changed and why: Nearby Search (New) now also requests the
-- `photos` field, so every discovered restaurant carries a
-- photo_reference (Google's resource name for its top photo) at zero
-- extra cost beyond the pricing-tier bump that field causes on Nearby
-- Search itself. Resolving that reference into actual image bytes is a
-- SEPARATE billed call, so it's done lazily, once, the first time a
-- restaurant's photo is requested (GET /api/restaurants/:id/photo) --
-- the image is then re-hosted in Supabase Storage and photo_url is set,
-- so every request after the first is free and serves straight from
-- Supabase's CDN, never asking Google again.

alter table restaurants
  add column if not exists photo_reference text,
  add column if not exists photo_url       text,
  add column if not exists photo_attribution text;

-- nearby_restaurants needs to return photo_reference so cards can show a
-- placeholder-vs-real-photo decision immediately, without a second
-- round trip per restaurant.
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
  google_review_count int,
  photo_reference     text,
  photo_url           text,
  photo_attribution   text
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
    r.google_review_count,
    r.photo_reference,
    r.photo_url,
    r.photo_attribution
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
