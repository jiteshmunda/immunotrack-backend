ALTER TABLE "users" ADD COLUMN "reset_password_otp" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_password_expires" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_password_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_password_requested_at" timestamp;