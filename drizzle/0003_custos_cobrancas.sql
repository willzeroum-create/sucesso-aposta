CREATE TABLE "charge_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"vehicle_id" text,
	"make" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"year" integer,
	"plate" text DEFAULT '' NOT NULL,
	"vin" text DEFAULT '' NOT NULL,
	"delivery_date" text,
	"sale_cents" integer DEFAULT 0 NOT NULL,
	"financed_cents" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charge_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"due_date" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charge_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"installment_id" text,
	"date" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text DEFAULT 'dinheiro' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_eur" double precision NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charge_contracts" ADD CONSTRAINT "charge_contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_contracts" ADD CONSTRAINT "charge_contracts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_installments" ADD CONSTRAINT "charge_installments_contract_id_charge_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."charge_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_payments" ADD CONSTRAINT "charge_payments_contract_id_charge_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."charge_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_payments" ADD CONSTRAINT "charge_payments_installment_id_charge_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."charge_installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_costs" ADD CONSTRAINT "vehicle_costs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charge_contracts_customer_idx" ON "charge_contracts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "charge_installments_contract_idx" ON "charge_installments" USING btree ("contract_id","due_date");--> statement-breakpoint
CREATE INDEX "charge_payments_contract_idx" ON "charge_payments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "charge_payments_installment_idx" ON "charge_payments" USING btree ("installment_id");--> statement-breakpoint
CREATE INDEX "vehicle_costs_vehicle_idx" ON "vehicle_costs" USING btree ("vehicle_id","date");