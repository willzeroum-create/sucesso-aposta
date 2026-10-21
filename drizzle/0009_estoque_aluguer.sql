ALTER TABLE "rentals" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "section" text DEFAULT 'site' NOT NULL;