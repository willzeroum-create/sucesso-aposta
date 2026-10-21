ALTER TABLE "charge_contracts" ADD COLUMN IF NOT EXISTS "down_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "charge_contracts" ADD COLUMN IF NOT EXISTS "debt_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Vendas já registadas: a dívida é o que se cobrava até agora (venda − financiado pelo banco); o saldo não muda.
UPDATE "charge_contracts" SET "debt_cents" = GREATEST("sale_cents" - "financed_cents", 0) WHERE "debt_cents" = 0;
