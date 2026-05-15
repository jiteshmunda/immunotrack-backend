import { z } from "zod";

export const createClinicianSchema = z.object({
  fullName: z
    .string()
    .min(1, "Full name is required")
    .regex(/^[a-zA-Z\s]+$/, "Full name must only contain letters and spaces"),
  
  email: z.string().email("Invalid email format"),
  
  specialty: z
    .string()
    .regex(/^[a-zA-Z\s]*$/, "Specialty must only contain letters and spaces")
    .optional(),
  
  licenseNumber: z
    .string()
    .min(1, "License number is required")
    .regex(/^[a-zA-Z0-9]+$/, "License number must be alphanumeric").optional(),
    
  organizationName: z.string().optional(),
  
  npiNumber: z
    .string()
    .length(10, "NPI number must be exactly 10 digits")
    .regex(/^\d+$/, "NPI number must only contain digits"),
  
  phone: z.string().optional(),
  
  stateOfLicensure: z.string().optional(),
  
  role: z.enum([
    "Allergist",
    "Immunologist",
    "Primary Care",
    "Nurse Practitioner",
    "Other",
  ], {
    message: "Please select a valid clinical role",
  }),
});

export type CreateClinicianInput = z.infer<typeof createClinicianSchema>;

export const addClinicalNoteSchema = z.object({
  note_type: z.string().min(1, "Note type is required"),
  notes: z.string().min(10, "Notes must be at least 10 characters long").max(5000, "Notes cannot exceed 5000 characters"),
});

export type AddClinicalNoteInput = z.infer<typeof addClinicalNoteSchema>;

export const patientDetailsResponseSchema = z.object({
  profile: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    dob: z.string().nullable(),
    sex: z.string().nullable(),
    mrn: z.string().nullable(),
    phone: z.string().nullable(),
    primary_diagnosis: z.string().nullable(),
  }),
  stats: z.object({
    risk_score: z.number(),
    risk_level: z.string(),
    active_alerts: z.number(),
  }),
  symptom_trends: z.array(z.object({
    date: z.string(),
    respiratory: z.number(),
    nasal: z.number(),
    skin: z.number(),
    risk_score: z.number(),
  })),
  clinical_notes: z.array(z.object({
    id: z.string(),
    type: z.string(),
    notes: z.string(),
    clinician_name: z.string(),
    created_at: z.date(),
  })),
  medications: z.object({
    plan: z.array(z.object({
      id: z.string(),
      name: z.string(),
      dose: z.string(),
      frequency: z.string(),
      category: z.string(),
      start_date: z.string().nullable(),
    })),
    adherence_30d: z.number(),
    weekly_adherence: z.array(z.number()),
  }),
  alerts: z.array(z.object({
    id: z.string(),
    type: z.string(),
    description: z.string().nullable(),
    severity: z.string(),
    created_at: z.date(),
  })),
});

export type PatientDetailsResponse = z.infer<typeof patientDetailsResponseSchema>;

export const clinicianAnalyticsResponseSchema = z.object({
  summary: z.object({
    total_patients: z.number(),
    average_adherence: z.number(),
    average_symptom_score: z.number(),
    high_risk_patients: z.number(),
  }),
  risk_distribution: z.object({
    low: z.number(),
    moderate: z.number(),
    high: z.number(),
  }),
  average_symptom_trend: z.array(z.object({
    week: z.string(),
    average_score: z.number(),
  })),
  patient_adherence_comparison: z.array(z.object({
    patient_name: z.string(),
    adherence_percentage: z.number(),
  })),
});

export type ClinicianAnalyticsResponse = z.infer<typeof clinicianAnalyticsResponseSchema>;
