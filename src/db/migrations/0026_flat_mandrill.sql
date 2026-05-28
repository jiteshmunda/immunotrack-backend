ALTER TABLE "alerts" ADD COLUMN "domain" varchar(20);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "alert_subtype" varchar(30);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "severity_from" varchar(20);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "severity_to" varchar(20);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "composite_score_at_trigger" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "composite_score_current" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "streak_days" smallint;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "weekly_change_pct" numeric(5, 2);