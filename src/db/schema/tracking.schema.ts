import {
  pgTable, uuid, varchar, text, timestamp,
  boolean, date, integer, smallint, numeric,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { patients } from "./profile.schema";
import { medicationCatalog } from "./medication.schema";

// ── Daily Logs ───────────────────────────────────────────────
export const dailyLogs = pgTable("daily_logs", {
  id:        uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  logDate:   date("log_date").notNull(),            // DATE — used for RPM transmission day counting
  loggedAt:  timestamp("logged_at").defaultNow().notNull(),

  // ── ACQ-6 Respiratory sub-items (0–6 each) ──────────────
  // Composite = mean of all 6 items. Range: 0.00–6.00
  acq1NightWaking:        smallint("acq1_night_waking").notNull(),
  acq2MorningSymptoms:    smallint("acq2_morning_symptoms").notNull(),
  acq3ActivityLimitation: smallint("acq3_activity_limitation").notNull(),
  acq4ShortnessOfBreath:  smallint("acq4_shortness_of_breath").notNull(),
  acq5Wheeze:             smallint("acq5_wheeze").notNull(),
  acq6RelieverUse:        smallint("acq6_reliever_use").notNull(),
  // mean of acq1–acq6. Green ≤0.75 | Amber 0.76–1.50 | Red >1.50
  respiratoryComposite:   numeric("respiratory_composite", { precision: 3, scale: 2 }).notNull(),

  // ── SNOT-22 Nasal sub-items (0–5 each) ──────────────────
  // Composite = sum of all 6 items. Range: 0–30
  sn1NasalBlockage: smallint("sn1_nasal_blockage").notNull(),
  sn2RunnyNose:     smallint("sn2_runny_nose").notNull(),
  sn3Sneezing:      smallint("sn3_sneezing").notNull(),
  sn4SmellTaste:    smallint("sn4_smell_taste").notNull(),
  sn5PostNasalDrip: smallint("sn5_post_nasal_drip").notNull(),
  sn6FacialPain:    smallint("sn6_facial_pain").notNull(),
  // sum of sn1–sn6. Green 0–7 | Amber 8–17 | Red 18–30
  nasalComposite:   smallint("nasal_composite").notNull(),

  // ── POEM Skin sub-items (0–4 each, frequency) ───────────
  // Composite = sum of all 7 items. Range: 0–28
  sk1Itch:             smallint("sk1_itch").notNull(),
  sk2SleepDisturbance: smallint("sk2_sleep_disturbance").notNull(),
  sk3Bleeding:         smallint("sk3_bleeding").notNull(),
  sk4Weeping:          smallint("sk4_weeping").notNull(),
  sk5Cracked:          smallint("sk5_cracked").notNull(),
  sk6Flaking:          smallint("sk6_flaking").notNull(),
  sk7Dryness:          smallint("sk7_dryness").notNull(),
  // sum of sk1–sk7. Green 0–7 | Amber 8–16 | Red 17–28
  skinComposite:       smallint("skin_composite").notNull(),

  // ── Optional breathing metrics ───────────────────────────
  peakFlow:           integer("peak_flow"),            // L/min
  rescueInhalerPuffs: integer("rescue_inhaler_puffs"), // 0–20
  nighttimeSymptoms:  boolean("nighttime_symptoms"),

  // PHI — AES-256 encrypted
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  patientDateIdx: uniqueIndex("daily_logs_patient_date_idx").on(table.patientId, table.logDate),
}));

// ── Daily Log Contexts (optional trigger/env inputs) ─────────
export const dailyLogContexts = pgTable("daily_log_contexts", {
  id:           uuid("id").primaryKey().defaultRandom(),
  dailyLogId:   uuid("daily_log_id").notNull().references(() => dailyLogs.id),

  // Indoor triggers
  smokeExposure:  boolean("smoke_exposure"),
  petExposure:    varchar("pet_exposure", { length: 50 }), 
  dustExposure:   boolean("dust_exposure"),

  // Activity & lifestyle
  exerciseIntensity: varchar("exercise_intensity", { length: 20 }),
  sleepQuality:      varchar("sleep_quality", { length: 20 }),     
  sleepHours:        numeric("sleep_hours", { precision: 4, scale: 1 }),
  stressLevel:       varchar("stress_level", { length: 20 }),   

  // Illness
  illness: boolean("illness"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Patient Medications ──────────────────────────────────────
export const patientMedications = pgTable("patient_medications", {
  id:        uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  medicationId: uuid("medication_id").references(() => medicationCatalog.id),

  // PHI — AES-256 encrypted
  name: text("name").notNull(),
  dose: text("dose").notNull(),
  category: varchar("category", { length: 100 }), 

  route:     varchar("route", { length: 50 }),       // oral | inhaled | topical | injection
  frequency: varchar("frequency", { length: 100 }).notNull(), // Daily | BID | PRN etc.
  startDate: date("start_date"),
  endDate:   date("end_date"),
  active:    boolean("active").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Medication Logs ──────────────────────────────────────────
export const medicationLogs = pgTable("medication_logs", {
  id:           uuid("id").primaryKey().defaultRandom(),
  patientId:    uuid("patient_id").notNull().references(() => patients.id),
  medicationId: uuid("medication_id").notNull().references(() => patientMedications.id),
  scheduledFor: timestamp("scheduled_for"),
  loggedAt:     timestamp("logged_at").defaultNow().notNull(),
  takenTime:    timestamp("taken_time"),
  status:       varchar("status", { length: 20 }).notNull(), // taken | missed
  // Required if status = missed
  missedReason: varchar("missed_reason", { length: 255 }), // forgot | side_effects | out_of_medication | other
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

// ── Environmental Data ───────────────────────────────────────
// Pulled from AQI / Pollen / Weather APIs per patient location
export const environmentalData = pgTable("environmental_data", {
  id:              uuid("id").primaryKey().defaultRandom(),
  patientId:       uuid("patient_id").notNull().references(() => patients.id),
  recordedDate:    date("recorded_date").notNull(),

  // AQI
  aqiValue:        integer("aqi_value"),
  pm25:            numeric("pm25", { precision: 6, scale: 2 }),

  // Pollen (grains/m³)
  grassPollenLevel: integer("grass_pollen_level"),
  treePollenLevel:  integer("tree_pollen_level"),
  weedPollenLevel:  integer("weed_pollen_level"),
  mouldCount:       integer("mould_count"),

  // Weather
  temperatureC:   numeric("temperature_c", { precision: 5, scale: 2 }),
  humidity:       integer("humidity"),               // percentage
  pressureHpa:    numeric("pressure_hpa", { precision: 7, scale: 2 }),
  windSpeed:      numeric("wind_speed", { precision: 5, scale: 2 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Medication Reminders ─────────────────────────────────────
export const medicationReminders = pgTable("medication_reminders", {
  id:           uuid("id").primaryKey().defaultRandom(),
  patientId:    uuid("patient_id").notNull().references(() => patients.id),
  medicationId: uuid("medication_id").notNull().references(() => patientMedications.id),
  reminderTime: varchar("reminder_time", { length: 5 }).notNull(), // HH:mm
  frequency:    varchar("frequency", { length: 100 }).default("DAILY").notNull(),
  isEnabled:    boolean("is_enabled").default(true).notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});