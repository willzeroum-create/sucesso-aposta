CREATE TABLE "registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text,
	"buyer" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seller" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vehicle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contract_date" text,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_file_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registrations_updated_idx" ON "registrations" USING btree ("updated_at");