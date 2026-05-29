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
  
  phone: z.string().min(10, "Phone number must be at least 10 digits long").regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number including country code (e.g. +1234567890)").optional(),
  
  stateOfLicensure: z.string().min(2, "State must be at least 2 characters").regex(/^[a-zA-Z\\s]+$/, "State must only contain letters and spaces").optional(),
  
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

export const updateClinicianProfileSchema = z.object({
  first_name: z
    .string()
    .regex(/^[a-zA-Z\s]+$/, "First name must only contain letters and spaces")
    .optional(),
  last_name: z
    .string()
    .regex(/^[a-zA-Z\s]+$/, "Last name must only contain letters and spaces")
    .optional(),
  specialty: z
    .string()
    .regex(/^[a-zA-Z\s]*$/, "Specialty must only contain letters and spaces")
    .optional(),
  licenseNumber: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, "License number must be alphanumeric")
    .optional(),
  npiNumber: z
    .string()
    .length(10, "NPI number must be exactly 10 digits")
    .regex(/^\d+$/, "NPI number must only contain digits")
    .optional(),
  phone: z.string().min(10, "Phone number must be at least 10 digits long").regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number including country code (e.g. +1234567890)").optional(),
  stateOfLicensure: z.string().min(2, "State must be at least 2 characters").regex(/^[a-zA-Z\\s]+$/, "State must only contain letters and spaces").optional(),
  role: z.enum([
    "Allergist",
    "Immunologist",
    "Primary Care",
    "Nurse Practitioner",
    "Other",
  ], {
    message: "Please select a valid clinical role",
  }).optional(),
  notifications_enabled: z.boolean().optional(),
});

export type UpdateClinicianProfileInput = z.infer<typeof updateClinicianProfileSchema>;

export const addClinicalNoteSchema = z.object({
  note_type: z.string().min(1, "Note type is required"),
  notes: z.string().min(10, "Notes must be at least 10 characters long").max(5000, "Notes cannot exceed 5000 characters"),
});

export type AddClinicalNoteInput = z.infer<typeof addClinicalNoteSchema>;

export const patientDetailsResponseSchema = z.object({
  header: z.object({
    name: z.string(),
    mrn: z.string().nullable(),
    dob: z.string().nullable(),
    sex: z.string().nullable(),
    phone: z.string().nullable(),
    primary_diagnosis: z.string().nullable(),
    last_log: z.string().nullable(),
    clinician: z.string().nullable(),
  }),
  composite_summary: z.object({
    respiratory: z.object({
      value: z.number(),
      label: z.string(),
      status: z.string(),
      status_color: z.string(),
      trend: z.object({
        direction: z.enum(["up", "down", "stable"]),
        value: z.number(),
        text: z.string(),
      }),
    }),
    nasal: z.object({
      value: z.number(),
      label: z.string(),
      status: z.string(),
      status_color: z.string(),
      trend: z.object({
        direction: z.enum(["up", "down", "stable"]),
        value: z.number(),
        text: z.string(),
      }),
    }),
    skin: z.object({
      value: z.number(),
      label: z.string(),
      status: z.string(),
      status_color: z.string(),
      trend: z.object({
        direction: z.enum(["up", "down", "stable"]),
        value: z.number(),
        text: z.string(),
      }),
    }),
  }),
  symptom_trends: z.array(z.object({
    date: z.string(),
    respiratory: z.number(),
    nasal: z.number(),
    skin: z.number(),
    risk_score: z.number(),
    sub_items: z.object({
      acq: z.object({
        acq1: z.number(),
        acq2: z.number(),
        acq3: z.number(),
        acq4: z.number(),
        acq5: z.number(),
        acq6: z.number(),
        mean: z.number(),
      }),
      snot: z.object({
        sn1: z.number(),
        sn2: z.number(),
        sn3: z.number(),
        sn4: z.number(),
        sn5: z.number(),
        sn6: z.number(),
        sum: z.number(),
      }),
      poem: z.object({
        sk1: z.number(),
        sk2: z.number(),
        sk3: z.number(),
        sk4: z.number(),
        sk5: z.number(),
        sk6: z.number(),
        sk7: z.number(),
        sum: z.number(),
      }),
    }),
  })),
  medication_adherence: z.object({
    percentage: z.number(),
    status: z.string(),
    doses_taken: z.number(),
    doses_total: z.number(),
    trend_text: z.string(),
  }),
  daily_log_summary: z.object({
    logs_completed: z.object({ count: z.number(), total: z.number(), percentage: z.number() }),
    symptoms_logged: z.object({ count: z.number(), total: z.number(), percentage: z.number() }),
    medications_logged: z.object({ count: z.number(), total: z.number(), percentage: z.number() }),
  }),
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
  }),
  alerts: z.array(z.object({
    id: z.string(),
    type: z.string(),
    description: z.string().nullable(),
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
