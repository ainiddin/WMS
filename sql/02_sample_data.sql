-- =====================================================================
-- 02_sample_data.sql : fictional test data
-- =====================================================================

INSERT INTO suppliers (supplier_id, supplier_name, phone, email) VALUES
 ('S001', 'PackPro LLP',      '+7 701 111 2233', 'sales@packpro.kz'),
 ('S002', 'BoxMaster LLP',    '+7 702 444 5566', 'info@boxmaster.kz'),
 ('S003', 'Almaty Tape Co.',  '+7 705 777 8899', NULL);

INSERT INTO employees (employee_id, full_name, role, phone) VALUES
 ('E001', 'Dauren Abenov',     'Manager', '+7 701 555 0100'),
 ('E002', 'Aruzhan Sadykova',  'Worker',  '+7 702 555 0101'),
 ('E003', 'Timur Kassymov',    'Worker',  '+7 707 555 0102');

-- Quantities here are the state AFTER the movements below
INSERT INTO products (product_id, product_name, supplier_id, quantity, min_quantity, last_updated) VALUES
 ('P001', 'Packing Tape',   'S001',  8, 10, '2026-10-14 09:00'),
 ('P002', 'Bubble Wrap',    'S001', 20, 10, '2026-10-14 10:00'),
 ('P003', 'Stretch Film',   'S001',  4, 15, '2026-10-13 16:30'),
 ('P004', 'Cardboard Box',  'S002', 40, 25, '2026-10-14 09:00'),
 ('P005', 'Paper Labels',   'S003', 30, 20, '2026-10-12 11:00');

INSERT INTO stock_movements (movement_id, product_id, employee_id, movement_type, quantity, movement_time) VALUES
 ('M0001', 'P001', 'E002', 'IN',  13, '2026-10-01 09:00'),
 ('M0002', 'P001', 'E002', 'OUT',  5, '2026-10-14 09:00'),
 ('M0003', 'P002', 'E003', 'IN',  20, '2026-10-14 10:00'),
 ('M0004', 'P003', 'E002', 'IN',  15, '2026-10-02 10:00'),
 ('M0005', 'P003', 'E003', 'OUT', 11, '2026-10-13 16:30'),
 ('M0006', 'P004', 'E003', 'IN',  50, '2026-10-05 12:00'),
 ('M0007', 'P004', 'E002', 'OUT', 10, '2026-10-14 09:00'),
 ('M0008', 'P005', 'E002', 'IN',  30, '2026-10-12 11:00');

-- continue the ID sequence after the sample rows
SELECT setval('movement_seq', 8);
