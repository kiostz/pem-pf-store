-- Renames honors to items and order_lines.honor_id to item_id, and drops orders.personal_data_removed_at with its CHECK.
-- Orders and order lines are rebuilt together: copy out, drop the children first, recreate, copy back, so the cascade never deletes a line.
-- The buyer columns become NOT NULL: an order with a NULL buyer field makes the copy-back fail and the whole file rolls back.

ALTER TABLE honors RENAME TO items; -- No foreign key points at honors; rows, CHECKs and STRICT are kept.
DROP INDEX honors_status_name; -- Indexes are recreated under items names below.
DROP INDEX honors_name_nocase; -- Same.
DROP INDEX honors_category_name; -- Same.
DROP INDEX honors_modified; -- Same.
DROP INDEX honors_category_modified; -- Same.
DROP INDEX honors_created; -- Same.
DROP INDEX honors_category_created; -- Same.
CREATE INDEX items_status_name ON items (status, name); -- The public list reads active items by name.
CREATE UNIQUE INDEX items_name_nocase ON items (name COLLATE NOCASE); -- Two admins cannot race to one name, whatever the case.
CREATE INDEX items_category_name ON items (category, name COLLATE NOCASE, id); -- Name order within a category, ties by id.
CREATE INDEX items_modified ON items (modified_at DESC, name COLLATE NOCASE, id); -- Recently changed, newest first.
CREATE INDEX items_category_modified ON items (category, modified_at DESC, name COLLATE NOCASE, id); -- The same within a category.
CREATE INDEX items_created ON items (created_at DESC, name COLLATE NOCASE, id); -- Newest created first.
CREATE INDEX items_category_created ON items (category, created_at DESC, name COLLATE NOCASE, id); -- The same within a category.

CREATE TABLE orders_copy AS SELECT * FROM orders; -- Plain copy of every order.
CREATE TABLE order_lines_copy AS SELECT rowid AS line_rowid, * FROM order_lines; -- Plain copy of every line with its rowid, which fixes line order.
DROP TABLE order_lines; -- The child goes first, so dropping orders cascades nowhere.
DROP TABLE orders; -- Its indexes go with it.

CREATE TABLE orders ( -- The orders table as 0001 and 0002 made it, minus the removal column.
  id INTEGER PRIMARY KEY, -- Row id.
  number TEXT NOT NULL UNIQUE, -- Order number shown to the buyer.
  created_at TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at), -- ISO UTC with milliseconds, a real date.
  step TEXT NOT NULL DEFAULT 'new' CHECK (step IN ('new', 'paid', 'handed_out', 'cancelled')), -- Where the order is.
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'), -- Three capital letters.
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0), -- Whole cents.
  buyer_name TEXT NOT NULL, -- Always present now that old orders are deleted whole.
  buyer_email TEXT NOT NULL, -- Always present.
  buyer_phone TEXT NOT NULL, -- Always present.
  club TEXT NOT NULL, -- Text, so a renamed club leaves old orders readable.
  request_id TEXT -- A UUID made by the shop per cart and form; NULL on old orders.
) STRICT; -- Column types are enforced.

CREATE TABLE order_lines ( -- Order lines, now keyed by item_id.
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE, -- Deleting an order deletes its lines.
  item_id TEXT NOT NULL, -- No foreign key: a deleted item leaves old orders readable.
  name TEXT NOT NULL, -- Name at order time.
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99), -- 1-99 per line.
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0), -- Price at order time, whole cents.
  PRIMARY KEY (order_id, item_id) -- One line per item per order.
) STRICT; -- Column types are enforced.

INSERT INTO orders (id, number, created_at, step, currency, total_cents, buyer_name, buyer_email, buyer_phone, club, request_id) SELECT id, number, created_at, step, currency, total_cents, buyer_name, buyer_email, buyer_phone, club, request_id FROM orders_copy ORDER BY id; -- Ids kept, so lines still match.
INSERT INTO order_lines (rowid, order_id, item_id, name, quantity, price_cents) SELECT line_rowid, order_id, honor_id, name, quantity, price_cents FROM order_lines_copy ORDER BY line_rowid; -- Old rowids kept, so line order is kept.

DROP TABLE order_lines_copy; -- The copies are no longer needed.
DROP TABLE orders_copy; -- Same.
CREATE INDEX orders_created_at ON orders (created_at); -- Orders are listed and pruned by date.
CREATE UNIQUE INDEX orders_request_id ON orders (request_id); -- One order per request id; many NULLs allowed.
