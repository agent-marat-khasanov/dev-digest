ALTER TABLE "pr_intent" ADD COLUMN "risks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "head_sha" text NOT NULL;