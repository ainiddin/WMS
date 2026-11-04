-- =====================================================================
-- KeyFive — Warehouse Management System (WMS) — Task 9
-- 01_schema.sql : tables, primary keys, foreign keys, data rules
-- DBMS: PostgreSQL 14+
-- =====================================================================

DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS products        CASCADE;
DROP TABLE IF EXISTS employees       CASCADE;
DROP TABLE IF EXISTS suppliers       CASCADE;

-- ---------------------------------------------------------------------
-- SUPPLIERS: companies that deliver products (contacts stored once)
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
    supplier_id    CHAR(4)      PRIMARY KEY
                   CHECK (supplier_id ~ '^S[0-9]{3}$'),          -- S001
    supplier_name  VARCHAR(100) NOT NULL,
    phone          VARCHAR(20)  NOT NULL,
    email          VARCHAR(100)
                   CHECK (email IS NULL OR email LIKE '%_@_%._%')
);

-- ---------------------------------------------------------------------
-- PRODUCTS: every product and its current stock
-- ---------------------------------------------------------------------
CREATE TABLE products (
    product_id     CHAR(4)      PRIMARY KEY
                   CHECK (product_id ~ '^P[0-9]{3}$'),           -- P001
    product_name   VARCHAR(100) NOT NULL,
    supplier_id    CHAR(4)      NOT NULL
                   REFERENCES suppliers (supplier_id)
                   ON UPDATE CASCADE ON DELETE RESTRICT,
    quantity       INT          NOT NULL DEFAULT 0
                   CHECK (quantity >= 0),                         -- no negative stock
    min_quantity   INT          NOT NULL DEFAULT 0
                   CHECK (min_quantity >= 0),                     -- restock level
    last_updated   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE             -- FALSE = archived
);

-- ---------------------------------------------------------------------
-- EMPLOYEES: managers and workers who use the WMS
-- ---------------------------------------------------------------------
CREATE TABLE employees (
    employee_id    CHAR(4)      PRIMARY KEY
                   CHECK (employee_id ~ '^E[0-9]{3}$'),          -- E001
    full_name      VARCHAR(100) NOT NULL,
    role           VARCHAR(10)  NOT NULL
                   CHECK (role IN ('Manager', 'Worker')),
    phone          VARCHAR(20)  NOT NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE             -- FALSE = former employee
);

-- ---------------------------------------------------------------------
-- STOCK_MOVEMENTS: bridge / event table — every IN or OUT operation
-- (resolves the M:N relationship PRODUCTS <-> EMPLOYEES)
-- ---------------------------------------------------------------------
CREATE TABLE stock_movements (
    movement_id    CHAR(5)      PRIMARY KEY
                   CHECK (movement_id ~ '^M[0-9]{4}$'),          -- M0001
    product_id     CHAR(4)      NOT NULL
                   REFERENCES products (product_id)
                   ON UPDATE CASCADE ON DELETE RESTRICT,          -- no orphan movements
    employee_id    CHAR(4)      NOT NULL
                   REFERENCES employees (employee_id)
                   ON UPDATE CASCADE ON DELETE RESTRICT,
    movement_type  VARCHAR(3)   NOT NULL
                   CHECK (movement_type IN ('IN', 'OUT')),
    quantity       INT          NOT NULL
                   CHECK (quantity > 0),
    movement_time  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sequence that generates the next movement ID (M0001, M0002, ...)
DROP SEQUENCE IF EXISTS movement_seq;
CREATE SEQUENCE movement_seq START 1;

-- Indexes for the foreign keys (faster JOINs and history searches)
CREATE INDEX idx_products_supplier  ON products (supplier_id);
CREATE INDEX idx_movements_product  ON stock_movements (product_id);
CREATE INDEX idx_movements_employee ON stock_movements (employee_id);
CREATE INDEX idx_movements_time     ON stock_movements (movement_time);
