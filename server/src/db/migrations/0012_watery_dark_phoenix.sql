ALTER TABLE "conventions" ALTER COLUMN "repo_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_code" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conventions_repo_idx" ON "conventions" USING btree ("repo_id");--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN "evidence_snippet";--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN "accepted";