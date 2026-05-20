import { z } from "zod";

export const updatePatientProfileSchema = z.object({
  zip_code: z.string().length(5, "Zip code must be 5 digits").optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  sex: z.enum(["male", "female", "other", "unknown"]).optional(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Must be a valid E.164 phone number").optional(),
  medication_reminders_enabled: z.boolean().optional(),
  reminder_time_utc: z.string().optional(),
  fcm_token: z.string().optional(),
  location: z.string().optional(),
  latitude: z.number().min(-90, "Latitude must be >= -90").max(90, "Latitude must be <= 90").optional(),
  longitude: z.number().min(-180, "Longitude must be >= -180").max(180, "Longitude must be <= 180").optional(),
});

export type UpdatePatientProfileInput = z.infer<typeof updatePatientProfileSchema>;

export const patientConsentSchema = z.object({
  consent_type: z.enum(["platform", "hipaa_npp", "rpm"]),
  consent_version: z.string().min(1, "Consent version is required"),
  scroll_completed: z.boolean(),
  typed_signature: z.string().optional(),
  icd10_code: z.string().optional(),
  device_platform: z.enum(["ios", "android"]),
  device_id: z.string().min(1, "Device ID is required"),
});

export type PatientConsentInput = z.infer<typeof patientConsentSchema>;
