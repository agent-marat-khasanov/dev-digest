ALTER TABLE "onboarding" ADD COLUMN "sha" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_out" integer;