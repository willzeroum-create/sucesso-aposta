CREATE TABLE "legalizations" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text,
	"customer_id" text,
	"requester" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vehicle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"modelo9_file_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legalizations" ADD CONSTRAINT "legalizations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legalizations" ADD CONSTRAINT "legalizations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legalizations_updated_idx" ON "legalizations" USING btree ("updated_at");