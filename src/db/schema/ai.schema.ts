import {
  pgTable, uuid, varchar, text, timestamp,
  boolean, date, numeric
} from "drizzle-orm/pg-core";
import { patients } from "./profile.schema";
import { users } from "./user.schema";

// ── AI Insights ──────────────────────────────────────────────
export const aiInsights = pgTable("ai_insights", {
  id:          uuid("id").primaryKey().defaultRandom(),
  patientId:   uuid("patient_id").notNull().references(() => patients.id),

  // trend | adherence | trigger | flare | allergy_summary
  insightType: varchar("insight_type", { length: 50 }).notNull(),

  // PHI — AES-256 encrypted
  title:          text("title").notNull(),
  description:    text("description").notNull(),
  recommendation: text("recommendation"),

  // low | medium | high
  riskLevel:   varchar("risk_level", { length: 20 }),
  generatedAt: timestamp("generated_at").notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

// ── Flare Predictions ────────────────────────────────────────
// 48–72 hour flare risk forecast per patient
// Thresholds: respiratory_composite >= 1.50 OR rescue_inhaler >= 4
// OR peak_flow decline >= 20% OR skin_composite >= 17
// OR nasal_composite >= 18
export const flarePredictions = pgTable("flare_predictions", {
  id:             uuid("id").primaryKey().defaultRandom(),
  patientId:      uuid("patient_id").notNull().references(() => patients.id),
  predictionDate: date("prediction_date").notNull(),

  // 0.00–1.00 probability score
  riskScore: numeric("risk_score", { precision: 5, scale: 2 }).notNull(),

  // low (<0.30) | moderate (0.30–0.69) | high (>=0.70)
  riskBand: varchar("risk_band", { length: 20 }).notNull(),

  // PHI — AES-256 encrypted
  basisSummary: text("basis_summary"),

  // Allergen context from lab results
  // JSON: { personalised_pollen_risk, allergen_season_active, max_inhalant_rast_class }
  allergenContext: text("allergen_context"),

  modelVersion: varchar("model_version", { length: 50 }),

  // high risk (>=0.70) triggers clinician alert
  alertTriggered: boolean("alert_triggered").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Trigger Discoveries ──────────────────────────────────────
// Statistically meaningful correlations between symptoms
// and environmental/behavioural exposures
export const triggerDiscoveries = pgTable("trigger_discoveries", {
  id:        uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),

  // PHI — AES-256 encrypted
  triggerName: text("trigger_name").notNull(),

  // environmental | allergen | behavioral | medication
  triggerCategory: varchar("trigger_category", { length: 50 }).notNull(),

  // Correlation coefficient
  correlationScore: numeric("correlation_score", { precision: 6, scale: 3 }).notNull(),

  // lag in days between trigger and symptom response
  lagDays: numeric("lag_days", { precision: 4, scale: 1 }),

  // low | moderate | high
  // High = statistical correlation + confirmed allergen sensitisation
  confidenceLevel: varchar("confidence_level", { length: 20 }),

  // confirmed_sensitisation | no_sensitisation_on_file | no_allergen_data
  allergenValidationLabel: varchar("allergen_validation_label", { length: 50 }),

  // PHI — AES-256 encrypted
  evidenceSummary:  text("evidence_summary"),
  weightingReason:  text("weighting_reason"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Alerts ───────────────────────────────────────────────────
// Clinical alerts generated from AI engine outputs
// Reviewing an alert starts an RPM clinician time session
export const alerts = pgTable("alerts", {
  id:        uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),

  // high_risk | nonadherence | deterioration | rpm_transmission_at_risk
  alertType: varchar("alert_type", { length: 50 }).notNull(),

  // low | medium | high | critical
  severity: varchar("severity", { length: 20 }).notNull(),

  // open | resolved | dismissed
  status: varchar("status", { length: 20 }).notNull().default("open"),

  // PHI — AES-256 encrypted
  title:       text("title").notNull(),
  description: text("description"),

  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

// ── Flare History ────────────────────────────────────────────
// Computed flare events — historical record of confirmed flares
export const flareHistory = pgTable("flare_history", {
  id:        uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  flareDate: date("flare_date").notNull(),

  // Which threshold triggered the flare classification
  // respiratory_composite | rescue_inhaler | peak_flow | skin_composite | nasal_composite
  triggerField:  varchar("trigger_field", { length: 50 }),
  triggerValue:  numeric("trigger_value", { precision: 6, scale: 2 }),

  // low | moderate | severe
  severity: varchar("severity", { length: 20 }),

  // PHI — AES-256 encrypted
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});