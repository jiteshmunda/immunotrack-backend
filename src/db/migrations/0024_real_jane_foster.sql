ALTER TABLE "users" ADD COLUMN "pending_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_update_otp" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_update_expires" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_update_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_update_requested_at" timestamp;