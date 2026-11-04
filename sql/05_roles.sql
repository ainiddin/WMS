-- =====================================================================
-- 05_roles.sql : access rules (Manager / Worker)
-- Run as a superuser. Each role gets only the data it needs.
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_manager') THEN
        CREATE ROLE wms_manager;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wms_worker') THEN
        CREATE ROLE wms_worker;
    END IF;
END $$;

REVOKE ALL ON suppliers, products, employees, stock_movements FROM PUBLIC;
REVOKE ALL ON FUNCTION record_movement(CHAR, CHAR, VARCHAR, INT) FROM PUBLIC;

-- Manager: sees everything, edits master data, records movements
GRANT SELECT, INSERT, UPDATE ON suppliers, products, employees TO wms_manager;
GRANT SELECT ON stock_movements TO wms_manager;
GRANT EXECUTE ON FUNCTION record_movement(CHAR, CHAR, VARCHAR, INT) TO wms_manager;

-- Worker: sees products only through a view WITHOUT supplier contacts,
-- and changes stock ONLY through record_movement() (no direct UPDATE)
CREATE OR REPLACE VIEW worker_products AS
SELECT product_id, product_name, quantity, min_quantity, last_updated
FROM products
WHERE is_active = TRUE;

GRANT SELECT ON worker_products TO wms_worker;
GRANT EXECUTE ON FUNCTION record_movement(CHAR, CHAR, VARCHAR, INT) TO wms_worker;
-- no rights on suppliers / employees (phone numbers are sensitive)
