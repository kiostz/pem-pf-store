-- Adds the shop's request id to orders, so a repeated send of the same cart returns the saved order instead of making a second one.
-- Old orders have none (NULL); a UNIQUE index allows many NULLs and refuses a repeated id.

ALTER TABLE orders ADD COLUMN request_id TEXT; -- A UUID made by the shop per cart and form; not personal data.
CREATE UNIQUE INDEX orders_request_id ON orders (request_id); -- One order per request id.
