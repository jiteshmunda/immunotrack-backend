ALTER TABLE "patient_medications" ADD COLUMN "name_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "patient_medications" ADD COLUMN "dose_hash" varchar(64);