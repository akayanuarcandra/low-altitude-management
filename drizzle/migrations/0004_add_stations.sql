-- Migration: add Station table

CREATE TABLE IF NOT EXISTS "Station" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "latitude" numeric(10,8) NOT NULL,
  "longitude" numeric(11,8) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
