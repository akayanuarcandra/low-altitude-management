-- Migration: add Patrol table
CREATE TABLE IF NOT EXISTS "Patrol" (
  "id" serial PRIMARY KEY NOT NULL,
  "drone_id" integer,
  "radius_meters" integer NOT NULL,
  "duration_seconds" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "start_lat" numeric(10,8),
  "start_lon" numeric(11,8),
  "route_json" text,
  "route_distance_m" integer,
  "route_duration_s" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "started_at" timestamp,
  "completed_at" timestamp,
  "last_error" text,
  CONSTRAINT fk_patrol_drone FOREIGN KEY (drone_id) REFERENCES "Drone" (id) ON DELETE SET NULL
);
