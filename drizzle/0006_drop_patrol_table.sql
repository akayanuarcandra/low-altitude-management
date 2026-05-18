-- Migration: remove Patrol table and task patrol columns
BEGIN;
ALTER TABLE IF EXISTS "Task" DROP COLUMN IF EXISTS patrol_radius_meters;
ALTER TABLE IF EXISTS "Task" DROP COLUMN IF EXISTS patrol_duration_seconds;
DROP TABLE IF EXISTS "Patrol";
COMMIT;
