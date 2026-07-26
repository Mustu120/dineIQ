-- DineIQ database schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

-- ---------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------
create table restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cuisine     text,
  price_level smallint check (price_level between 1 and 4),
  latitude    double precision not null,
  longitude   double precision not null,
  address     text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- reviews
-- user_id points at Supabase's built-in auth.users table -- no custom
-- users table needed.
-- ---------------------------------------------------------------------
create table reviews (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  review_text     text,
  sentiment_score real,
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
-- Results are sorted closest-first and include the distance in km.
-- ---------------------------------------------------------------------
create or replace function nearby_restaurants(
  lat double precision,
  long double precision,
  radius_km double precision,
  cuisine_filter text default null,
  price_level_filter smallint default null
)
returns table (
  id          uuid,
  name        text,
  cuisine     text,
  price_level smallint,
  latitude    double precision,
  longitude   double precision,
  address     text,
  created_at  timestamptz,
  distance_km double precision
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
    r.created_at,
    ST_Distance(
      r.location,
      ST_SetSRID(ST_MakePoint(long, lat), 4326)::geography
    ) / 1000 as distance_km
  from restaurants r
  where ST_DWithin(
    r.location,
    ST_SetSRID(ST_MakePoint(long, lat), 4326)::geography,
    radius_km * 1000  -- ST_DWithin takes metres, so convert km -> m
  )
  and (cuisine_filter is null or r.cuisine = cuisine_filter)
  and (price_level_filter is null or r.price_level = price_level_filter)
  order by distance_km asc;
$$;
