-- Migration: Normalize table status values to match enum definition
-- This fixes data integrity issues where statuses were stored in mixed case

-- Map capitalized values to correct enum values
UPDATE tables SET status = 'free' WHERE status = 'Available';
UPDATE tables SET status = 'occupied' WHERE status = 'Occupied';
UPDATE tables SET status = 'billing_done' WHERE status = 'Billing';

-- Log what was changed
-- SELECT 'Migration: Normalized table status values' as message;

-- Verify: Check that all status values are now valid enum values
-- SELECT DISTINCT status FROM tables ORDER BY status;
