ALTER TABLE "charge_contracts" DROP CONSTRAINT "charge_contracts_guarantor_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "charge_contracts" DROP COLUMN "guarantor_customer_id";