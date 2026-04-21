CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_hash_unique" UNIQUE("email_hash")
);
--> statement-breakpoint
CREATE TABLE "care_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"license_number" text,
	"specialty" varchar(100),
	"organization_name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"icd10_code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "diagnoses_icd10_code_unique" UNIQUE("icd10_code")
);
--> statement-breakpoint
CREATE TABLE "patient_clinician_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"care_team_id" uuid,
	"is_primary" boolean DEFAULT false NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"diagnosis_id" uuid NOT NULL,
	"diagnosed_at" date,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date_of_birth" text NOT NULL,
	"sex" varchar(20) NOT NULL,
	"phone" text,
	"mrn" text,
	"primary_diagnosis" text,
	"location_zip" varchar(20),
	"icd10_qualifying_code" varchar(20),
	"rpm_enrollment_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_log_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_log_id" uuid NOT NULL,
	"smoke_exposure" boolean,
	"pet_exposure" varchar(50),
	"dust_exposure" boolean,
	"exercise_intensity" varchar(20),
	"sleep_quality" varchar(20),
	"sleep_hours" numeric(4, 1),
	"stress_level" varchar(20),
	"illness" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"acq1_night_waking" smallint NOT NULL,
	"acq2_morning_symptoms" smallint NOT NULL,
	"acq3_activity_limitation" smallint NOT NULL,
	"acq4_shortness_of_breath" smallint NOT NULL,
	"acq5_wheeze" smallint NOT NULL,
	"acq6_reliever_use" smallint NOT NULL,
	"respiratory_composite" numeric(3, 2) NOT NULL,
	"sn1_nasal_blockage" smallint NOT NULL,
	"sn2_runny_nose" smallint NOT NULL,
	"sn3_sneezing" smallint NOT NULL,
	"sn4_smell_taste" smallint NOT NULL,
	"sn5_post_nasal_drip" smallint NOT NULL,
	"sn6_facial_pain" smallint NOT NULL,
	"nasal_composite" smallint NOT NULL,
	"sk1_itch" smallint NOT NULL,
	"sk2_sleep_disturbance" smallint NOT NULL,
	"sk3_bleeding" smallint NOT NULL,
	"sk4_weeping" smallint NOT NULL,
	"sk5_cracked" smallint NOT NULL,
	"sk6_flaking" smallint NOT NULL,
	"sk7_dryness" smallint NOT NULL,
	"skin_composite" smallint NOT NULL,
	"peak_flow" integer,
	"rescue_inhaler_puffs" integer,
	"nighttime_symptoms" boolean,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environmental_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"recorded_date" date NOT NULL,
	"aqi_value" integer,
	"pm25" numeric(6, 2),
	"grass_pollen_level" integer,
	"tree_pollen_level" integer,
	"weed_pollen_level" integer,
	"mould_count" integer,
	"temperature_c" numeric(5, 2),
	"humidity" integer,
	"pressure_hpa" numeric(7, 2),
	"wind_speed" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"scheduled_for" timestamp,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) NOT NULL,
	"missed_reason" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dose" text NOT NULL,
	"route" varchar(50),
	"frequency" varchar(100) NOT NULL,
	"start_date" date,
	"end_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"insight_type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"recommendation" text,
	"risk_level" varchar(20),
	"generated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flare_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"flare_date" date NOT NULL,
	"trigger_field" varchar(50),
	"trigger_value" numeric(6, 2),
	"severity" varchar(20),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flare_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"prediction_date" date NOT NULL,
	"risk_score" numeric(5, 2) NOT NULL,
	"risk_band" varchar(20) NOT NULL,
	"basis_summary" text,
	"allergen_context" text,
	"model_version" varchar(50),
	"alert_triggered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_discoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"trigger_name" text NOT NULL,
	"trigger_category" varchar(50) NOT NULL,
	"correlation_score" numeric(6, 3) NOT NULL,
	"lag_days" numeric(4, 1),
	"confidence_level" varchar(20),
	"allergen_validation_label" varchar(50),
	"evidence_summary" text,
	"weighting_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allergen_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allergen_code" varchar(50) NOT NULL,
	"allergen_name" varchar(200) NOT NULL,
	"allergen_category" varchar(50) NOT NULL,
	"allergen_subcategory" varchar(50),
	"loinc_code" varchar(20),
	"snomed_code" varchar(20),
	"is_component" boolean DEFAULT false NOT NULL,
	"parent_allergen_code" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "allergen_catalog_allergen_code_unique" UNIQUE("allergen_code")
);
--> statement-breakpoint
CREATE TABLE "allergen_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"lab_order_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL,
	"allergen_code" varchar(50) NOT NULL,
	"allergen_name" text NOT NULL,
	"allergen_category" varchar(50) NOT NULL,
	"test_method" varchar(20) NOT NULL,
	"value_kul" numeric(8, 2),
	"rast_class" smallint,
	"result_flag" varchar(10),
	"reference_range_low" numeric(8, 2),
	"reference_range_high" numeric(8, 2),
	"is_sensitised" boolean NOT NULL,
	"sensitisation_level" varchar(20) NOT NULL,
	"loinc_code" varchar(20),
	"fhir_observation_id" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drug_reaction_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"drug_name" text NOT NULL,
	"drug_snomed_code" varchar(20),
	"reaction_type" varchar(30) NOT NULL,
	"reaction_description" text NOT NULL,
	"severity" varchar(20),
	"date_of_reaction" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eosinophil_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"lab_order_id" uuid NOT NULL,
	"absolute_count" integer,
	"percentage" numeric(5, 2),
	"reference_range_absolute_high" integer,
	"reference_range_pct_high" numeric(5, 2),
	"result_flag" varchar(10),
	"fhir_observation_id" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"lab_source" varchar(20) NOT NULL,
	"connected_at" timestamp NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"fhir_patient_id" varchar(200),
	"last_pull_at" timestamp,
	"connection_status" varchar(20) NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"clinician_id" uuid,
	"source" varchar(20) NOT NULL,
	"source_report_id" text,
	"fhir_diagnostic_report_id" varchar(200),
	"report_date" date NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"lab_name" text,
	"ordering_clinician" text,
	"raw_document_url" text,
	"ocr_extracted" boolean DEFAULT false NOT NULL,
	"ocr_confidence" numeric(3, 2),
	"clinician_verified" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skin_prick_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"lab_order_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL,
	"allergen_name" text NOT NULL,
	"wheal_mm" numeric(4, 1) NOT NULL,
	"histamine_control_mm" numeric(4, 1) NOT NULL,
	"saline_control_mm" numeric(4, 1),
	"is_positive" boolean NOT NULL,
	"clinician_id" uuid NOT NULL,
	"test_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "total_ige_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"lab_order_id" uuid NOT NULL,
	"value_kul" numeric(8, 2) NOT NULL,
	"reference_range_low" numeric(8, 2),
	"reference_range_high" numeric(8, 2),
	"result_flag" varchar(10),
	"fhir_observation_id" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(100),
	"resource_id" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"status" varchar(20),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_export_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"requested_at" timestamp NOT NULL,
	"scope" varchar(30) NOT NULL,
	"format" varchar(10) NOT NULL,
	"date_range_start" date,
	"date_range_end" date,
	"delivery_method" varchar(10) NOT NULL,
	"status" varchar(20) NOT NULL,
	"file_s3_key" text,
	"file_size_bytes" integer,
	"download_url_expires_at" timestamp,
	"downloaded_at" timestamp,
	"email_sent_at" timestamp,
	"email_delivered" boolean,
	"reauth_method" varchar(20) NOT NULL,
	"reauth_at" timestamp NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpm_billing_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"billing_month" varchar(7) NOT NULL,
	"rolling_period_id" uuid,
	"calendar_period_id" uuid,
	"cpt_99453_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99445_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99454_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99470_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99457_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99458_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99091_eligible" boolean DEFAULT false NOT NULL,
	"exported_at" timestamp,
	"export_s3_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpm_calendar_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"rpm_consent_id" uuid NOT NULL,
	"calendar_month" varchar(7) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"transmission_days" integer DEFAULT 0 NOT NULL,
	"review_minutes_total" integer DEFAULT 0 NOT NULL,
	"cpt_99470_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99457_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99458_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99091_eligible" boolean DEFAULT false NOT NULL,
	"period_status" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpm_clinician_time_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_period_id" uuid NOT NULL,
	"clinician_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"session_start" timestamp NOT NULL,
	"session_end" timestamp,
	"duration_minutes" integer,
	"activity_type" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpm_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"consent_signed_at" timestamp NOT NULL,
	"enrollment_date" date NOT NULL,
	"icd10_code" text NOT NULL,
	"icd10_qualifying_code" varchar(20) NOT NULL,
	"consent_pdf_url" text,
	"consent_version" varchar(20),
	"device_identifier" text,
	"clinician_confirmed" boolean DEFAULT false NOT NULL,
	"status" varchar(20) NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rpm_rolling_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"rpm_consent_id" uuid NOT NULL,
	"period_number" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"transmission_days" integer DEFAULT 0 NOT NULL,
	"cpt_tier" varchar(10) DEFAULT 'none',
	"cpt_99445_eligible" boolean DEFAULT false NOT NULL,
	"cpt_99454_eligible" boolean DEFAULT false NOT NULL,
	"period_status" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinicians" ADD CONSTRAINT "clinicians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_clinician_assignments" ADD CONSTRAINT "patient_clinician_assignments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_clinician_assignments" ADD CONSTRAINT "patient_clinician_assignments_clinician_id_clinicians_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."clinicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_clinician_assignments" ADD CONSTRAINT "patient_clinician_assignments_care_team_id_care_teams_id_fk" FOREIGN KEY ("care_team_id") REFERENCES "public"."care_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_diagnoses" ADD CONSTRAINT "patient_diagnoses_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_diagnoses" ADD CONSTRAINT "patient_diagnoses_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_log_contexts" ADD CONSTRAINT "daily_log_contexts_daily_log_id_daily_logs_id_fk" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environmental_data" ADD CONSTRAINT "environmental_data_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_medication_id_patient_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."patient_medications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flare_history" ADD CONSTRAINT "flare_history_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flare_predictions" ADD CONSTRAINT "flare_predictions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_discoveries" ADD CONSTRAINT "trigger_discoveries_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergen_results" ADD CONSTRAINT "allergen_results_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergen_results" ADD CONSTRAINT "allergen_results_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allergen_results" ADD CONSTRAINT "allergen_results_allergen_id_allergen_catalog_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergen_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_reaction_history" ADD CONSTRAINT "drug_reaction_history_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_reaction_history" ADD CONSTRAINT "drug_reaction_history_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eosinophil_results" ADD CONSTRAINT "eosinophil_results_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eosinophil_results" ADD CONSTRAINT "eosinophil_results_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_connections" ADD CONSTRAINT "lab_connections_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skin_prick_results" ADD CONSTRAINT "skin_prick_results_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skin_prick_results" ADD CONSTRAINT "skin_prick_results_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skin_prick_results" ADD CONSTRAINT "skin_prick_results_allergen_id_allergen_catalog_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergen_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skin_prick_results" ADD CONSTRAINT "skin_prick_results_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "total_ige_results" ADD CONSTRAINT "total_ige_results_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "total_ige_results" ADD CONSTRAINT "total_ige_results_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_export_requests" ADD CONSTRAINT "patient_export_requests_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_billing_summaries" ADD CONSTRAINT "rpm_billing_summaries_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_billing_summaries" ADD CONSTRAINT "rpm_billing_summaries_rolling_period_id_rpm_rolling_periods_id_fk" FOREIGN KEY ("rolling_period_id") REFERENCES "public"."rpm_rolling_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_billing_summaries" ADD CONSTRAINT "rpm_billing_summaries_calendar_period_id_rpm_calendar_periods_id_fk" FOREIGN KEY ("calendar_period_id") REFERENCES "public"."rpm_calendar_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_calendar_periods" ADD CONSTRAINT "rpm_calendar_periods_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_calendar_periods" ADD CONSTRAINT "rpm_calendar_periods_rpm_consent_id_rpm_consents_id_fk" FOREIGN KEY ("rpm_consent_id") REFERENCES "public"."rpm_consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_clinician_time_logs" ADD CONSTRAINT "rpm_clinician_time_logs_calendar_period_id_rpm_calendar_periods_id_fk" FOREIGN KEY ("calendar_period_id") REFERENCES "public"."rpm_calendar_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_clinician_time_logs" ADD CONSTRAINT "rpm_clinician_time_logs_clinician_id_users_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_clinician_time_logs" ADD CONSTRAINT "rpm_clinician_time_logs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_consents" ADD CONSTRAINT "rpm_consents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_rolling_periods" ADD CONSTRAINT "rpm_rolling_periods_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rpm_rolling_periods" ADD CONSTRAINT "rpm_rolling_periods_rpm_consent_id_rpm_consents_id_fk" FOREIGN KEY ("rpm_consent_id") REFERENCES "public"."rpm_consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rpm_calendar_periods_patient_month_unique" ON "rpm_calendar_periods" USING btree ("patient_id","calendar_month");--> statement-breakpoint
CREATE UNIQUE INDEX "rpm_rolling_periods_patient_period_unique" ON "rpm_rolling_periods" USING btree ("patient_id","period_number");