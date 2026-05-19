ALTER TABLE "alerts" ADD COLUMN "resolution_note" varchar(500);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "risk_score" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "patient_medication_id" uuid;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_patient_medication_id_patient_medications_id_fk" FOREIGN KEY ("patient_medication_id") REFERENCES "public"."patient_medications"("id") ON DELETE no action ON UPDATE no action;