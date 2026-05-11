CREATE TABLE "medication_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"reminder_time" varchar(5) NOT NULL,
	"frequency" varchar(100) DEFAULT 'DAILY' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medication_reminders" ADD CONSTRAINT "medication_reminders_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_reminders" ADD CONSTRAINT "medication_reminders_medication_id_patient_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."patient_medications"("id") ON DELETE no action ON UPDATE no action;