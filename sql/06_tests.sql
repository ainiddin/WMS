-- =====================================================================
-- 06_tests.sql : checks that the rules really stop wrong data
-- Every test below is expected to FAIL with an error.
-- Run with:  psql -d wms -f 06_tests.sql   (ON_ERROR_STOP must be off)
-- =====================================================================

\echo '--- T1: negative stock (CHECK quantity >= 0) — expected ERROR'
UPDATE products SET quantity = -5 WHERE product_id = 'P001';

\echo '--- T2: duplicate primary key P002 (UNIQUE) — expected ERROR'
INSERT INTO products (product_id, product_name, supplier_id) VALUES ('P002', 'Bubble Wrap', 'S001');

\echo '--- T3: empty product name (NOT NULL) — expected ERROR'
INSERT INTO products (product_id, product_name, supplier_id) VALUES ('P010', NULL, 'S001');

\echo '--- T4: orphan record — product P999 does not exist (FOREIGN KEY) — expected ERROR'
INSERT INTO stock_movements (movement_id, product_id, employee_id, movement_type, quantity)
VALUES ('M9999', 'P999', 'E002', 'OUT', 5);

\echo '--- T5: wrong movement type (CHECK IN/OUT) — expected ERROR'
INSERT INTO stock_movements (movement_id, product_id, employee_id, movement_type, quantity)
VALUES ('M9998', 'P001', 'E002', 'OTU', 5);

\echo '--- T6: delete a product that has history (ON DELETE RESTRICT) — expected ERROR'
DELETE FROM products WHERE product_id = 'P001';

\echo '--- T7: ship 30 when only 20 are left — transaction must roll back — expected ERROR'
SELECT record_movement('P002', 'E002', 'OUT', 30);

\echo '--- T7 check: no new movement was saved and P002 still has 20'
SELECT (SELECT COUNT(*) FROM stock_movements) AS movements_total,
       (SELECT quantity FROM products WHERE product_id = 'P002') AS p002_quantity;

\echo '--- T8: a correct shipment works — expected OK'
SELECT record_movement('P002', 'E002', 'OUT', 5) AS new_movement_id;
SELECT product_id, quantity FROM products WHERE product_id = 'P002';

\echo '--- T9: archive instead of delete'
UPDATE products SET is_active = FALSE WHERE product_id = 'P005';
SELECT product_id, product_name, is_active FROM products WHERE product_id = 'P005';
