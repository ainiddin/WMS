-- =====================================================================
-- 07_improvement_product_suppliers.sql  (planned improvement — Alua)
-- Bridge table for the M:N relationship PRODUCTS <-> SUPPLIERS,
-- so one product can have several suppliers with different prices.
-- =====================================================================

CREATE TABLE IF NOT EXISTS product_suppliers (
    product_id   CHAR(4)        NOT NULL REFERENCES products  (product_id)  ON DELETE RESTRICT,
    supplier_id  CHAR(4)        NOT NULL REFERENCES suppliers (supplier_id) ON DELETE RESTRICT,
    price        NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    PRIMARY KEY (product_id, supplier_id)          -- composite key: one price per pair
);

INSERT INTO product_suppliers (product_id, supplier_id, price) VALUES
 ('P001', 'S001', 450.00),
 ('P001', 'S003', 420.00),
 ('P004', 'S002', 300.00)
ON CONFLICT DO NOTHING;

-- Cheapest supplier for each product
SELECT DISTINCT ON (ps.product_id)
       ps.product_id, p.product_name, s.supplier_name, ps.price
FROM product_suppliers ps
JOIN products  p ON p.product_id  = ps.product_id
JOIN suppliers s ON s.supplier_id = ps.supplier_id
ORDER BY ps.product_id, ps.price;
