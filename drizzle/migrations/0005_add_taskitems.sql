-- Migration: add TaskItem table

CREATE TABLE IF NOT EXISTS "TaskItem" (
  "id" serial PRIMARY KEY NOT NULL,
  "task_id" integer NOT NULL,
  "waypoint_id" integer,
  "latitude" numeric(10,8),
  "longitude" numeric(11,8),
  "quantity" integer NOT NULL DEFAULT 1,
  "seq" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending',
  "assigned_drone_id" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_task FOREIGN KEY (task_id) REFERENCES "Task" (id) ON DELETE CASCADE,
  CONSTRAINT fk_waypoint FOREIGN KEY (waypoint_id) REFERENCES "Waypoint" (id) ON DELETE SET NULL,
  CONSTRAINT fk_drone FOREIGN KEY (assigned_drone_id) REFERENCES "Drone" (id) ON DELETE SET NULL
);
