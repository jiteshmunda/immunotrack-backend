ALTER TABLE "medication_reminders" ADD COLUMN "days_of_week" text;--> statement-breakpoint
ALTER TABLE "medication_reminders" ADD COLUMN "day_of_month" integer;--> statement-breakpoint
ALTER TABLE "medication_reminders" ADD COLUMN "month" integer;--> statement-breakpoint
ALTER TABLE "medication_reminders" ADD COLUMN "next_dose_date" date;--> statement-breakpoint
ALTER TABLE "medication_reminders" ADD COLUMN "interval_weeks" integer;--> statement-breakpoint
ALTER TABLE "patient_medications" ADD COLUMN "notes" text;