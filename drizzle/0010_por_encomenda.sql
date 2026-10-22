ALTER TABLE "vehicle_photos" ADD COLUMN "credit" text;--> statement-breakpoint
ALTER TABLE "vehicle_photos" ADD COLUMN "credit_url" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "on_order" boolean DEFAULT false NOT NULL;