ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "price_on_request" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Pedido do stand (20/10/2026): todos os preços do site passam a «sob consulta» até serem confirmados.
UPDATE "vehicles" SET "price_on_request" = true WHERE "price_on_request" = false;
