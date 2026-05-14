ALTER TABLE "alerts" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_triggered_at" timestamp DEFAULT now() NOT NULL;