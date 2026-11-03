-- Gives every honor a created and a last-changed time, and makes names unique ignoring case.
-- It also adds the indexes the admin list reads in order: three sorts, each alone and within a category.

-- A constant default is the only default ALTER TABLE ADD COLUMN accepts; it fills all existing rows with the D1 import date and keeps any INSERT that names no time valid.
ALTER TABLE honors ADD COLUMN created_at TEXT NOT NULL DEFAULT '2026-11-01T00:00:00.000Z' CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at); -- ISO UTC with milliseconds, a real date, as orders.created_at.
ALTER TABLE honors ADD COLUMN modified_at TEXT NOT NULL DEFAULT '2026-11-01T00:00:00.000Z' CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modified_at) IS modified_at); -- Set by the Admin Worker on every admin edit, never by an order.

-- Two admins cannot race to one name, whatever the case.
CREATE UNIQUE INDEX honors_name_nocase ON honors (name COLLATE NOCASE);
-- Name order within a category, ties by id.
CREATE INDEX honors_category_name ON honors (category, name COLLATE NOCASE, id);
-- Recently changed: newest change first, ties by name A-Z then id; alone and within a category.
CREATE INDEX honors_modified ON honors (modified_at DESC, name COLLATE NOCASE, id);
CREATE INDEX honors_category_modified ON honors (category, modified_at DESC, name COLLATE NOCASE, id);
-- Newest: newest creation first, same ties; alone and within a category.
CREATE INDEX honors_created ON honors (created_at DESC, name COLLATE NOCASE, id);
CREATE INDEX honors_category_created ON honors (category, created_at DESC, name COLLATE NOCASE, id);
