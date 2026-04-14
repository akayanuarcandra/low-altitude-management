ALTER TABLE "Drone" DROP CONSTRAINT "Drone_tower_id_Tower_id_fk";
--> statement-breakpoint
ALTER TABLE "Drone" ALTER COLUMN "latitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Drone" ALTER COLUMN "longitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Drone" ALTER COLUMN "tower_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Drone" ALTER COLUMN "status" SET DEFAULT 'inventory';--> statement-breakpoint
ALTER TABLE "Drone" ADD CONSTRAINT "Drone_tower_id_Tower_id_fk" FOREIGN KEY ("tower_id") REFERENCES "public"."Tower"("id") ON DELETE set null ON UPDATE no action;