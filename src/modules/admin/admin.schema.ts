import { z } from "zod";

export const createSystemAdminSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must not exceed 100 characters")
    .regex(/^[a-zA-Z\s]+$/, "Full name must only contain letters and spaces"),
  
  email: z
    .string()
    .email("Please enter a valid email address")
    .max(255, "Email must not exceed 255 characters")
    .toLowerCase(),
    
  organizationName: z
    .string()
    .min(1, "Organization name is required for system admins")
    .max(255, "Organization name must not exceed 255 characters"),
});

export type CreateSystemAdminInput = z.infer<typeof createSystemAdminSchema>;
