ALTER TABLE "patients" ALTER COLUMN "icd10_qualifying_code" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "patient_diagnosis" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "icd10_code" SET DATA TYPE text;