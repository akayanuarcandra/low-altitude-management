-- Migration: drop patrols table (removed server-side patrol persistence)
-- Run this migration against your Postgres DB.

BEGIN;
DROP TABLE IF EXISTS "Patrol";
-- Also drop any dependent objects if necessary (foreign keys handled by CASCADE in code where used)
COMMIT;
