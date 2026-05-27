ALTER TABLE "clinicians" ADD COLUMN "notifications_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "weather_condition" varchar(100);--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "source_provider" varchar(100);--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "environmental_data" ADD COLUMN "longitude" numeric(9, 6);