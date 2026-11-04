-- =====================================================================
-- 03_queries.sql : SELECT queries that turn data into information
-- =====================================================================

-- Q1. Restocking list (main business query)
-- Which active products are below their restock level, and whom to call?
SELECT p.product_id, p.product_name, p.quantity, p.min_quantity,
       s.supplier_name, s.phone
FROM products p
JOIN suppliers s ON p.supplier_id = s.supplier_id
WHERE p.quantity < p.min_quantity
  AND p.is_active = TRUE
ORDER BY p.quantity;

-- Q2. One connected record: movement -> product -> supplier + employee
SELECT m.movement_id, m.movement_type, m.quantity, m.movement_time,
       p.product_name, s.supplier_name, e.full_name AS recorded_by
FROM stock_movements m
JOIN products  p ON m.product_id  = p.product_id
JOIN suppliers s ON p.supplier_id = s.supplier_id
JOIN employees e ON m.employee_id = e.employee_id
WHERE m.movement_id = 'M0002';

-- Q3. Movement history of one product (who moved it and when)
SELECT m.movement_time, m.movement_type, m.quantity, e.full_name
FROM stock_movements m
JOIN employees e ON m.employee_id = e.employee_id
WHERE m.product_id = 'P001'
ORDER BY m.movement_time;

-- Q4. Monthly usage report (Aibar's next action):
-- how many units of each product were shipped (OUT) per month
SELECT DATE_TRUNC('month', m.movement_time)::date AS month,
       p.product_name,
       SUM(m.quantity) AS units_shipped
FROM stock_movements m
JOIN products p ON m.product_id = p.product_id
WHERE m.movement_type = 'OUT'
GROUP BY month, p.product_name
ORDER BY month, units_shipped DESC;

-- Q5. Daily reconciliation check (Ainiddin's next action):
-- PRODUCTS.quantity must equal SUM(IN) - SUM(OUT).
-- An empty result means the stock is consistent.
SELECT p.product_id, p.product_name,
       p.quantity AS stored_quantity,
       COALESCE(SUM(CASE WHEN m.movement_type = 'IN'  THEN m.quantity END), 0)
     - COALESCE(SUM(CASE WHEN m.movement_type = 'OUT' THEN m.quantity END), 0)
       AS calculated_quantity
FROM products p
LEFT JOIN stock_movements m ON m.product_id = p.product_id
GROUP BY p.product_id, p.product_name, p.quantity
HAVING p.quantity <>
       COALESCE(SUM(CASE WHEN m.movement_type = 'IN'  THEN m.quantity END), 0)
     - COALESCE(SUM(CASE WHEN m.movement_type = 'OUT' THEN m.quantity END), 0);
