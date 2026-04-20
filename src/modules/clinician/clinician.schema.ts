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
});

export type CreateClinicianInput = z.infer<typeof createClinicianSchema>;
