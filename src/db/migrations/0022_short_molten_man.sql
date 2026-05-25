ALTER TABLE "environmental_data" ALTER COLUMN "pm25" SET DATA TYPE numeric(8, 2);--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "zip_code" varchar(20);--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "aqi_category" varchar(50);--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "pollen_total" integer;--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "temperature_f" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "data_source" varchar(100);--> statement-breakpoint
CREATE INDEX "environmental_data_patient_date_idx" ON "environmental_data" USING btree ("patient_id","recorded_date");--> statement-breakpoint
ALTER TABLE "environmental_data" DROP COLUMN "temperature_c";--> statement-breakpoint
ALTER TABLE "environmental_data" DROP COLUMN "pressure_hpa";--> statement-breakpoint
ALTER TABLE "environmental_data" DROP COLUMN "wind_speed";