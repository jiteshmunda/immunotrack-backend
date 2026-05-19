import { z } from "zod";
import { MEDICATION_FREQUENCIES } from "../../common/constants/medication";

export const addMedicationSchema = z.object({
  medicationId: z.string().uuid().optional(),
  name: z.string().min(1, "Medication name is required"),
  category: z.string().min(1, "Category is required"),
  dose: z.string().min(1, "Dosage is required"),
  route: z.string().optional(),
  frequency: z.enum(MEDICATION_FREQUENCIES).optional(),
  startDate: z.string().optional(), // YYYY-MM-DD
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

export type AddMedicationRequest = z.infer<typeof addMedicationSchema>;
