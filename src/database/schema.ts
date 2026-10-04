export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT, -- NULL for OAuth (Google) users
  phone TEXT,
  avatar TEXT,
  role TEXT DEFAULT 'USER',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tables created before OAuth support had password NOT NULL.
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- Proven owner of the email (signed in with Google, or the seeded admin). Emails from
-- ADMIN_EMAILS grant ADMIN only when verified, so registering someone else's address
-- with a password can't take over their role. Users from before email sign-up
-- were all Google users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN;
UPDATE users SET email_verified = (password IS NULL) WHERE email_verified IS NULL;
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;

CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  image TEXT,
  images TEXT[],
  cuisine TEXT,
  price_range TEXT,
  work_time TEXT,
  phone TEXT,
  gis_link TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id UUID REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  guests INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, restaurant_id)
);

-- Fields added after the initial schema.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS price_min INTEGER,
  ADD COLUMN IF NOT EXISTS price_max INTEGER,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  -- Address in Russian, as 2GIS indexes it; address is the English one shown in the UI.
  ADD COLUMN IF NOT EXISTS gis_address TEXT,
  -- the manual "tables available today" switch; availability is computed from bookings now
  DROP COLUMN IF EXISTS is_active;

DO $$ BEGIN
  ALTER TABLE restaurants ADD CONSTRAINT chk_restaurants_price_range CHECK (price_min <= price_max);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT,
  -- the table is held from time for this many hours
  ADD COLUMN IF NOT EXISTS hours INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_code ON bookings (code);
-- A table can hold only one active booking per slot; guards against double booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_table_slot_active
  ON bookings (table_id, date, time) WHERE status <> 'CANCELLED';

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_tables_number ON restaurant_tables (restaurant_id, number);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);
-- also serves the ON DELETE CASCADE from restaurant_tables
CREATE INDEX IF NOT EXISTS idx_bookings_table_slot ON bookings (table_id, date, time);
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant_date ON bookings (restaurant_id, date);
-- admin list: newest first
CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings (date DESC, time DESC);

-- Covered by the leading column of a unique index, so they only slowed down writes.
DROP INDEX IF EXISTS idx_restaurant_tables_restaurant;
DROP INDEX IF EXISTS idx_favorites_user;
`;
