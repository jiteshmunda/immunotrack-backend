import { z } from "zod";

export const LogSymptomsSchema = z.object({
  log_date: z.string().describe("ISO date string (YYYY-MM-DD)"),
  
  // ACQ-6 (0-6)
  acq1_night_waking:        z.number().min(0).max(6),
  acq2_morning_symptoms:    z.number().min(0).max(6),
  acq3_activity_limitation: z.number().min(0).max(6),
  acq4_shortness_of_breath: z.number().min(0).max(6),
  acq5_wheeze:             z.number().min(0).max(6),
  acq6_reliever_use:        z.number().min(0).max(6),

  // SNOT-6 (0-5)
  sn1_nasal_blockage: z.number().min(0).max(5),
  sn2_runny_nose:     z.number().min(0).max(5),
  sn3_sneezing:      z.number().min(0).max(5),
  sn4_smell_taste:    z.number().min(0).max(5),
  sn5_post_nasal_drip: z.number().min(0).max(5),
  sn6_facial_pain:    z.number().min(0).max(5),

  // POEM (0-4)
  sk1_itch:             z.number().min(0).max(4),
  sk2_sleep_disturbance: z.number().min(0).max(4),
  sk3_bleeding:         z.number().min(0).max(4),
  sk4_weeping:          z.number().min(0).max(4),
  sk5_cracked:          z.number().min(0).max(4),
  sk6_flaking:          z.number().min(0).max(4),
  sk7_dryness:          z.number().min(0).max(4),

  // Optional core log metadata
  peak_flow:           z.number().optional(),
  rescue_inhaler_puffs: z.number().min(0).max(20).optional(),
  nighttime_symptoms:  z.boolean().optional(),
  notes:               z.string().optional(),
});

export type LogSymptomsInput = z.infer<typeof LogSymptomsSchema>;

export const HistoryFiltersSchema = z.object({
  period: z.enum(["today", "7days", "month", "custom"]).optional().default("7days"),
  startDate: z.string().describe("ISO date string (YYYY-MM-DD)").optional(),
  endDate:   z.string().describe("ISO date string (YYYY-MM-DD)").optional(),
});

export type HistoryFilters = z.infer<typeof HistoryFiltersSchema>;
