CREATE TABLE "company_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"person" text NOT NULL,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_eur" double precision NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "company_expenses_date_idx" ON "company_expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "company_expenses_person_idx" ON "company_expenses" USING btree ("person");--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || '["expenses.manage"]'::jsonb WHERE "id" = 'role_manager' AND NOT ("permissions" @> '["expenses.manage"]'::jsonb);
