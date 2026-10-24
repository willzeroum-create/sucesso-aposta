CREATE TABLE "legal_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'empresa' NOT NULL,
	"name" text NOT NULL,
	"nif" text,
	"doc_number" text,
	"cert_code" text,
	"address" text,
	"postal_code" text,
	"city" text,
	"email" text,
	"phone" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legalizations" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "legalizations" ADD COLUMN "stage" text DEFAULT 'modelo9' NOT NULL;--> statement-breakpoint
ALTER TABLE "legalizations" ADD COLUMN "entry_date" text;--> statement-breakpoint
ALTER TABLE "legalizations" ADD COLUMN "customs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "legalizations" ADD COLUMN "registration" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "legal_clients_name_idx" ON "legal_clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX "legal_clients_nif_idx" ON "legal_clients" USING btree ("nif");--> statement-breakpoint
ALTER TABLE "legalizations" ADD CONSTRAINT "legalizations_client_id_legal_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."legal_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legalizations_client_idx" ON "legalizations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "legalizations_stage_idx" ON "legalizations" USING btree ("stage");