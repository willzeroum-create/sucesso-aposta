ALTER TABLE "vehicles" ADD COLUMN "features" jsonb;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "source_partner" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "source_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_source_unique" ON "vehicles" USING btree ("source_partner","source_ref");