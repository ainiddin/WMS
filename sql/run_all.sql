-- Runs everything in order:  psql -d wms -f run_all.sql
\set ON_ERROR_STOP on
\i 01_schema.sql
\i 02_sample_data.sql
\i 04_transaction.sql
\i 05_roles.sql
\echo '===== QUERIES ====='
\i 03_queries.sql
\i 07_improvement_product_suppliers.sql
\unset ON_ERROR_STOP
\set ON_ERROR_STOP off
\echo '===== TESTS (errors below are EXPECTED) ====='
\i 06_tests.sql
