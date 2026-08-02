-- DineIQ database schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

-- ---------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------
create table restaurants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  cuisine         text,
  price_level     smallint check (price_level between 1 and 4),
  latitude        double precision not null,
  longitude       double precision not null,
  address         text,
  -- Live-data fields. Restaurant discovery (GET /api/restaurants/nearby)
  -- upserts from Google Places Nearby Search (New), keyed on
  -- google_place_id -- see server/utils/googlePlaces.js. osm_id (from the
  -- free OpenStreetMap Overpass API, server/utils/overpass.js) is kept as
  -- a fallback source if Google's API is unreachable; a restaurant found
  -- by one has the other's id column null, or both if later matched.
  osm_id          text unique,
  phone           text,
  website         text,
  opening_hours   text,
  source          text not null default 'osm' check (source in ('osm', 'google', 'manual')),
  last_synced_at  timestamptz,
  -- google_rating/google_review_count come free with Nearby Search;
  -- google_synced_at also gates the separate, lazy per-restaurant review
  -- import (GET /api/restaurants/:id/reviews) so a re-opened detail page
  -- doesn't re-spend that call for 30 days.
  google_place_id     text unique,
  google_rating       numeric(2, 1),
  google_review_count int,
  google_synced_at    timestamptz,
  -- photo_reference comes free with Nearby Search; photo_url is set
  -- lazily the first time GET /api/restaurants/:id/photo re-hosts the
  -- actual image bytes in Supabase Storage (a separate billed Google
  -- call, done once and cached forever after -- see server/index.js).
  photo_reference     text,
  photo_url           text,
  photo_attribution   text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- reviews
-- user_id points at Supabase's built-in auth.users table -- nullable
-- because imported Google reviews (source='google') have no DineIQ user.
-- source distinguishes reviews written in DineIQ from ones imported from
-- Google; external_id is Google's own review id, used to avoid
-- re-importing the same review on a later visit (Phase 20.3 of the guide).
-- ---------------------------------------------------------------------
create table reviews (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  review_text     text,
  sentiment_score real,
  source          text not null default 'user' check (source in ('user', 'google')),
  -- unique (not a partial index -- see migrations/002_google_reviews.sql
  -- for why): Postgres never treats two NULLs as equal, so this still
  -- allows unlimited DineIQ-native reviews with no external_id.
  external_id     text unique,
  author_name     text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- favourites
-- one row per (user, restaurant) pair -- the unique constraint stops a
-- user from favouriting the same restaurant twice.
-- ---------------------------------------------------------------------
create table favourites (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (user_id, restaurant_id)
);

-- helpful indexes for common lookups
create index reviews_restaurant_id_idx on reviews (restaurant_id);
create index reviews_user_id_idx on reviews (user_id);
create index favourites_user_id_idx on favourites (user_id);

-- ---------------------------------------------------------------------
-- PostGIS: enable the extension
-- ---------------------------------------------------------------------
create extension if not exists postgis with schema extensions;

-- Add a geography column that stays in sync with latitude/longitude
-- automatically (it's a "generated" column -- Postgres recomputes it
-- whenever latitude or longitude changes, you never write to it directly).
alter table restaurants
  add column location geography(point, 4326)
  generated always as (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) stored;

-- Spatial index so "nearby" queries are fast
create index restaurants_location_idx on restaurants using gist (location);

-- Example: find the 10 closest restaurants to a given point
-- (replace :lng / :lat with the user's coordinates)
--
-- select id, name, address
-- from restaurants
-- order by location <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
-- limit 10;

-- Example: find restaurants within 2km of a given point
--
-- select id, name, address
-- from restaurants
-- where ST_DWithin(
--   location,
--   ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
--   2000  -- metres
-- );

-- ---------------------------------------------------------------------
-- Row Level Security (recommended)
-- reviews and favourites reference auth.users, so without RLS any
-- signed-in user could read or edit anyone else's rows via the API.
-- ---------------------------------------------------------------------
alter table restaurants enable row level security;
alter table reviews enable row level security;
alter table favourites enable row level security;

-- restaurants: public read, no direct client writes (use a server/service role for that)
create policy "restaurants are viewable by everyone"
  on restaurants for select
  using (true);

-- reviews: everyone can read, but you can only write/edit your own
create policy "reviews are viewable by everyone"
  on reviews for select
  using (true);

create policy "users can insert their own reviews"
  on reviews for insert
  with check (auth.uid() = user_id);

create policy "users can update their own reviews"
  on reviews for update
  using (auth.uid() = user_id);

create policy "users can delete their own reviews"
  on reviews for delete
  using (auth.uid() = user_id);

-- favourites: users can only see and manage their own
create policy "users can view their own favourites"
  on favourites for select
  using (auth.uid() = user_id);

create policy "users can insert their own favourites"
  on favourites for insert
  with check (auth.uid() = user_id);

create policy "users can delete their own favourites"
  on favourites for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- nearby_restaurants: an RPC function for "restaurants near me" search.
-- Filters by radius (required) and optionally by cuisine / price_level.
-- Results are sorted closest-first and include the distance in km, plus
-- a live rating aggregate (avg_rating, review_count) joined in from the
-- reviews table -- this is the Bayesian-average input described in the
-- guide (Phase 7), computed fresh on every call rather than cached.
-- ---------------------------------------------------------------------
create or replace function nearby_restaurants(
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
  -- Comes free with Google Places Nearby Search, so a freshly-discovered
  -- restaurant with zero DineIQ reviews can still show a real rating
  -- instead of "New". The frontend prefers this over avg_rating/
  -- review_count (DineIQ's own reviews) when it's present.
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
    radius_km * 1000  -- ST_DWithin takes metres, so convert km -> m
  )
  and (cuisine_filter is null or r.cuisine = cuisine_filter)
  and (price_level_filter is null or r.price_level = price_level_filter)
  order by distance_km asc;
$$;
