CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'redeemed', 'expired', 'invalidated');--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"patient_id" uuid,
	"current_step" varchar(30) NOT NULL,
	"verification_token" text,
	"device_id" varchar(255) NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "patient_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"consent_type" varchar(20) NOT NULL,
	"consent_version" varchar(10) NOT NULL,
	"consented_at" timestamp NOT NULL,
	"device_platform" varchar(10) NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"scroll_completed" boolean DEFAULT false NOT NULL,
	"typed_signature" varchar(200),
	"icd10_code" varchar(10),
	"consent_form_version" varchar(10) NOT NULL,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"phone" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"generic_name" varchar(255),
	"brand_names" text,
	"category" varchar(100) NOT NULL,
	"sub_category" varchar(100),
	"route" varchar(50),
	"standard_dose" text,
	"available_strengths" text,
	"frequency" varchar(100),
	"indicated_for" text,
	"rx_otc" varchar(20),
	"clinical_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "medication_catalog_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_enrollment_code_unique";--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "clinicians" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "clinicians" ADD COLUMN "npi_number" text;--> statement-breakpoint
ALTER TABLE "clinicians" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "clinicians" ADD COLUMN "state_of_licensure" varchar(100);--> statement-breakpoint
ALTER TABLE "clinicians" ADD COLUMN "clinical_role" varchar(100);--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "medication_reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "reminder_time_utc" varchar(5);--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "fcm_token" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "monitoring_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invite_code" varchar(12) NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invite_code_display" varchar(14) NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "clinic_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "patient_email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "patient_first_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "patient_last_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "patient_dob" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "patient_diagnosis" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "icd10_code" varchar(20);--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "rpm_enrolled" varchar(10) DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "personal_message" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "generated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "email_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "redemption_attempted_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "redeemed_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "redeemed_by_patient_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "resend_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "last_resent_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invalidated_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invalidated_reason" varchar(100);--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_invite_id_invitations_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinicians" ADD CONSTRAINT "clinicians_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_redeemed_by_patient_id_patients_id_fk" FOREIGN KEY ("redeemed_by_patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN "enrollment_code";--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invite_code_unique" UNIQUE("invite_code");