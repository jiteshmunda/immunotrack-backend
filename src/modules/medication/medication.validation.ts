import { z } from "zod";

export const logMedicationSchema = z.object({
  medicationId: z.string().uuid("Invalid medication ID"),
  status: z.enum(["taken", "missed"]),
  takenTime: z.string().optional(),
  missedReason: z.string().trim().optional(),
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

export const createReminderSchema = z.object({
  medicationId: z.string().uuid("Invalid medication ID"),
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)"),
  frequency: z.string().optional().default("DAILY"),
});

export const toggleReminderSchema = z.object({
  active: z.boolean(),
});
