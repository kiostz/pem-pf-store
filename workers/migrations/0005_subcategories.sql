-- Adds subcategories and items.subcategory_id, moves every honor area item to the category Honors with its old honor area as its subcategory, and renames Shirt to Shirts.
-- Items keep their modified_at: this is not an admin edit. An unknown category stops the whole file before anything moves.

CREATE TABLE subcategories ( -- A named group inside one category.
  id INTEGER PRIMARY KEY, -- Row id; the nine honor areas below get fixed ids 1-9.
  category TEXT NOT NULL CHECK (length(category) > 0), -- The category this subcategory belongs to.
  name TEXT NOT NULL CHECK (length(name) > 0 AND name = trim(name)) -- Non-empty and trimmed.
) STRICT; -- Column types are enforced.

CREATE UNIQUE INDEX subcategories_category_name ON subcategories (category, name COLLATE NOCASE); -- One name per category, whatever the case.

INSERT INTO subcategories (id, category, name) VALUES -- The nine honor areas, A-Z, with the same ids on every database.
  (1, 'Honors', 'ADRA'), -- Id 1.
  (2, 'Honors', 'Arts and Crafts'), -- Id 2.
  (3, 'Honors', 'Health and Science'), -- Id 3.
  (4, 'Honors', 'Household Arts'), -- Id 4.
  (5, 'Honors', 'Nature'), -- Id 5.
  (6, 'Honors', 'Outdoor Industries'), -- Id 6.
  (7, 'Honors', 'Outreach'), -- Id 7.
  (8, 'Honors', 'Recreation'), -- Id 8.
  (9, 'Honors', 'Vocational'); -- Id 9.

SELECT CASE WHEN EXISTS (SELECT 1 FROM items WHERE category NOT IN ('ADRA', 'Arts and Crafts', 'Health and Science', 'Household Arts', 'Nature', 'Outdoor Industries', 'Outreach', 'Recreation', 'Vocational', 'Accessories', 'Shirt')) THEN abs(-9223372036854775807 - 1) ELSE 0 END; -- Integer overflow aborts the whole file when an item has an unknown category.

ALTER TABLE items ADD COLUMN subcategory_id INTEGER REFERENCES subcategories (id); -- NULL means no subcategory; a used subcategory cannot be deleted.

UPDATE items SET subcategory_id = (SELECT id FROM subcategories WHERE category = 'Honors' AND name = items.category), category = 'Honors' WHERE category NOT IN ('Accessories', 'Shirt'); -- SET reads the old row, so the lookup still sees the honor area name.

UPDATE items SET category = 'Shirts' WHERE category = 'Shirt'; -- The category is now plural.
