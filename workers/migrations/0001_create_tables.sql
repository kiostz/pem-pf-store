-- Creates every table the store needs: honors, clubs, settings, orders and order lines.
-- Constraints live here so a bad write fails in the database, whatever code sent it.
-- Tables are STRICT, so an INTEGER column refuses text and fractions (money stays whole cents).

-- Honors: the catalogue with stock and price.
CREATE TABLE honors (
  id TEXT PRIMARY KEY, -- Slug; never changes.
  name TEXT NOT NULL CHECK (length(name) > 0), -- Shown to buyers.
  category TEXT NOT NULL CHECK (length(category) > 0), -- Group heading.
  issued_by TEXT NOT NULL CHECK (length(issued_by) > 0), -- Issuing body.
  skill_level INTEGER CHECK (skill_level IS NULL OR skill_level BETWEEN 1 AND 3), -- 1-3 or unknown.
  status TEXT NOT NULL CHECK (status IN ('active', 'hidden')), -- Hidden honors are not public.
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), -- Never below 0, so an oversell rolls the order back.
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0), -- Whole cents.
  image TEXT CHECK (image IS NULL OR length(image) > 0) -- Path or key of the picture, if any.
) STRICT;
-- The public list reads active honors by name.
CREATE INDEX honors_status_name ON honors (status, name);

-- Clubs: the club list buyers pick from.
CREATE TABLE clubs (
  id INTEGER PRIMARY KEY, -- Row id.
  name TEXT NOT NULL UNIQUE CHECK (length(name) > 0 AND name = trim(name) AND lower(name) <> 'other'), -- Unique, trimmed, never "other".
  area TEXT CHECK (area IS NULL OR length(area) > 0), -- NULL, never ''.
  language TEXT CHECK (language IS NULL OR length(language) > 0), -- NULL, never ''.
  location TEXT CHECK (location IS NULL OR length(location) > 0), -- NULL, never ''.
  church_name TEXT CHECK (church_name IS NULL OR length(church_name) > 0), -- NULL, never ''.
  position INTEGER NOT NULL -- Display order; not unique so a move is one update.
) STRICT;

-- Settings: exactly one row.
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Only row 1 can exist.
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'), -- Three capital letters.
  default_price_cents INTEGER NOT NULL CHECK (default_price_cents >= 0), -- Whole cents.
  order_email_on INTEGER NOT NULL DEFAULT 1 CHECK (order_email_on IN (0, 1)) -- Order email switch.
) STRICT;

-- Orders: one per sent cart.
CREATE TABLE orders (
  id INTEGER PRIMARY KEY, -- Row id.
  number TEXT NOT NULL UNIQUE, -- Order number shown to the buyer.
  created_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at), -- ISO UTC with milliseconds, a real date.
  step TEXT NOT NULL DEFAULT 'new' CHECK (step IN ('new', 'paid', 'handed_out', 'cancelled')), -- Where the order is.
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'), -- Three capital letters.
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0), -- Whole cents.
  buyer_name TEXT, -- Nullable: cleared by the personal-data removal.
  buyer_email TEXT, -- Nullable: cleared by the personal-data removal.
  buyer_phone TEXT, -- Nullable: cleared by the personal-data removal.
  club TEXT NOT NULL, -- Text, so a renamed club leaves old orders readable.
  personal_data_removed_at TEXT, -- Set when the buyer fields were cleared.
  CHECK (personal_data_removed_at IS NULL OR (buyer_name IS NULL AND buyer_email IS NULL AND buyer_phone IS NULL)) -- Once removal is marked, no buyer data may remain.
) STRICT;
-- Orders are listed and pruned by date.
CREATE INDEX orders_created_at ON orders (created_at);

-- Order lines: honor, quantity and a name and price snapshot.
CREATE TABLE order_lines (
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE, -- Deleting an order deletes its lines.
  honor_id TEXT NOT NULL, -- No foreign key: a deleted honor leaves old orders readable.
  name TEXT NOT NULL, -- Name at order time.
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99), -- 1-99 per line.
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0), -- Price at order time, whole cents.
  PRIMARY KEY (order_id, honor_id) -- One line per honor per order.
) STRICT;
