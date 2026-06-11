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
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)").optional(),
  times: z.array(z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)")).optional(),
  frequency: z.string().optional().default("DAILY"),
  daysOfWeek: z.array(z.string()).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  month: z.number().min(1).max(12).optional(),
  nextDoseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional(),
  intervalWeeks: z.union([z.literal(2), z.literal(4)]).optional(),
  timezone: z.string().optional(),
}).refine((data) => {
  return data.time !== undefined || (data.times !== undefined && data.times.length > 0);
}, {
  message: "Either 'time' or 'times' array must be provided",
  path: ["time"]
});

export const updateReminderSchema = z.object({
  active: z.boolean().optional(),
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:mm)").optional(),
  daysOfWeek: z.array(z.string()).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  month: z.number().min(1).max(12).optional(),
  nextDoseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional(),
  intervalWeeks: z.union([z.literal(2), z.literal(4)]).optional(),
  timezone: z.string().optional(),
});
