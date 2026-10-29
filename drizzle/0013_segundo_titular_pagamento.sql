ALTER TABLE "charge_contracts" ADD COLUMN "second_customer_id" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "buyer2" jsonb;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "seller2" jsonb;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "payment" jsonb;--> statement-breakpoint
ALTER TABLE "charge_contracts" ADD CONSTRAINT "charge_contracts_second_customer_id_customers_id_fk" FOREIGN KEY ("second_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;