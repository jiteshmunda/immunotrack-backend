import { z } from "zod";

export const invitePatientSchema = z.object({
  patient_first_name: z.string().min(1, "First name is required"),
  patient_last_name: z.string().min(1, "Last name is required"),
  patient_email: z.string().email("Invalid email format"),
  patient_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  patient_diagnosis: z.string().min(1, "Diagnosis is required"),
  icd10_code: z.string().min(1, "ICD-10 code is required"),
  rpm_enrolled: z.boolean(),
  personal_message: z.string().max(500, "Message must be under 500 characters").optional(),
});

export const verifyInviteSchema = z.object({
  invite_code: z.string().min(1, "Invite code is required"),
  patient_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  device_id: z.string().min(1, "Device ID is required"),
});

export const registerPatientSchema = z.object({
  verification_token: z.string().min(1, "Verification token is required"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
});

export const resendInviteSchema = z.object({
  invite_id: z.string().uuid("Invalid invite ID format"),
});

export type InvitePatientInput = z.infer<typeof invitePatientSchema>;
export type VerifyInviteInput = z.infer<typeof verifyInviteSchema>;
export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;
export type ResendInviteInput = z.infer<typeof resendInviteSchema>;
