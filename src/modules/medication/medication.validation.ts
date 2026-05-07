import { z } from "zod";

export const logMedicationSchema = z.object({
  medicationId: z.string().uuid("Invalid medication ID"),
  status: z.enum(["taken", "missed"]),
  scheduledFor: z.string().optional(), 
  takenTime: z.string().optional(),
  missedReason: z.enum(["forgot", "side_effects", "out_of_medication", "other"]).optional(),
}).refine((data) => {
  if (data.status === "taken" && !data.takenTime) {
    return false;
  }
  if (data.status === "missed" && !data.missedReason) {
    return false;
  }
  return true;
}, {
  message: "takenTime is required for 'taken' status, and missedReason is required for 'missed' status",
  path: ["status"],
});

export type LogMedicationInput = z.infer<typeof logMedicationSchema>;
