import {
  pgTable, uuid, varchar, text, timestamp,
  boolean, date, numeric, smallint, integer
} from "drizzle-orm/pg-core";
import { patients } from "./profile.schema";
import { users } from "./user.schema";

// ── Allergen Catalog ─────────────────────────────────────────
// Reference table — maintained centrally, not per-patient
export const allergenCatalog = pgTable("allergen_catalog", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  allergenCode:        varchar("allergen_code", { length: 50 }).notNull().unique(), // e.g. 'f1' = egg white, 'e1' = cat dander
  allergenName:        varchar("allergen_name", { length: 200 }).notNull(),
  // inhalant_pollen | inhalant_mould | inhalant_dander | inhalant_dust_mite | food | drug | venom | other
  allergenCategory:    varchar("allergen_category", { length: 50 }).notNull(),
  // tree | grass | weed | animal | nut | shellfish etc.
  allergenSubcategory: varchar("allergen_subcategory", { length: 50 }),
  loincCode:           varchar("loinc_code", { length: 20 }),
  snomedCode:          varchar("snomed_code", { length: 20 }),
  // true if component allergen (e.g. Ara h 2)
  isComponent:         boolean("is_component").default(false).notNull(),
  // links component to parent (e.g. Ara h 2 → peanut f13)
  parentAllergenCode:  varchar("parent_allergen_code", { length: 50 }),
  createdAt:           timestamp("created_at").defaultNow().notNull(),
});

// ── Lab Connections ──────────────────────────────────────────
// OAuth connections per patient per lab (Quest / Labcorp)
// Tokens stored encrypted — NEVER logged, NEVER exposed via API
export const labConnections = pgTable("lab_connections", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  patientId:              uuid("patient_id").notNull().references(() => patients.id),
  // quest | labcorp
  labSource:              varchar("lab_source", { length: 20 }).notNull(),
  connectedAt:            timestamp("connected_at").notNull(),
  // AES-256 encrypted OAuth tokens
  accessTokenEncrypted:   text("access_token_encrypted").notNull(),
  refreshTokenEncrypted:  text("refresh_token_encrypted").notNull(),
  tokenExpiresAt:         timestamp("token_expires_at").notNull(),
  fhirPatientId:          varchar("fhir_patient_id", { length: 200 }),
  lastPullAt:             timestamp("last_pull_at"),
  // active | expired | revoked | error
  connectionStatus:       varchar("connection_status", { length: 20 }).notNull(),
  revokedAt:              timestamp("revoked_at"),
  createdAt:              timestamp("created_at").defaultNow().notNull(),
});

// ── Lab Orders ───────────────────────────────────────────────
// One record per lab order / result set
// Parent record for all allergen_results from the same report
export const labOrders = pgTable("lab_orders", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  patientId:              uuid("patient_id").notNull().references(() => patients.id),
  // null if patient self-uploaded
  clinicianId:            uuid("clinician_id").references(() => users.id),
  // quest | labcorp | scan_upload | manual_entry
  source:                 varchar("source", { length: 20 }).notNull(),
  // AES-256 encrypted — external report ID
  sourceReportId:         text("source_report_id"),
  fhirDiagnosticReportId: varchar("fhir_diagnostic_report_id", { length: 200 }),
  reportDate:             date("report_date").notNull(),
  receivedAt:             timestamp("received_at").defaultNow().notNull(),
  // AES-256 encrypted
  labName:                text("lab_name"),
  orderingClinician:      text("ordering_clinician"),
  // S3 URL — AES-256 encrypted
  rawDocumentUrl:         text("raw_document_url"),
  // true if values extracted via OCR/AI
  ocrExtracted:           boolean("ocr_extracted").default(false).notNull(),
  // 0.00–1.00 OCR confidence score
  ocrConfidence:          numeric("ocr_confidence", { precision: 3, scale: 2 }),
  // false until clinician confirms — unverified results
  // blocked from patient endpoints and AI engines
  clinicianVerified:      boolean("clinician_verified").default(false).notNull(),
  // AES-256 encrypted
  notes:                  text("notes"),
  createdAt:              timestamp("created_at").defaultNow().notNull(),
});

// ── Allergen Results ─────────────────────────────────────────
// One record per allergen per lab order
// Core allergy sensitisation store
// Covers specific IgE, food panel, and drug panel results
export const allergenResults = pgTable("allergen_results", {
  id:               uuid("id").primaryKey().defaultRandom(),
  patientId:        uuid("patient_id").notNull().references(() => patients.id),
  labOrderId:       uuid("lab_order_id").notNull().references(() => labOrders.id),
  allergenId:       uuid("allergen_id").notNull().references(() => allergenCatalog.id),
  // Denormalised for query performance
  allergenCode:     varchar("allergen_code", { length: 50 }).notNull(),
  // AES-256 encrypted — denormalised for display
  allergenName:     text("allergen_name").notNull(),
  // inhalant_pollen | food | drug | venom | other
  allergenCategory: varchar("allergen_category", { length: 50 }).notNull(),
  // specific_ige | total_ige | skin_prick
  testMethod:       varchar("test_method", { length: 20 }).notNull(),
  // Specific IgE numeric result in kU/L
  valueKul:         numeric("value_kul", { precision: 8, scale: 2 }),
  // 0–6 — computed from value_kul
  // Class 0 <0.10 | Class 1 0.10–0.34 | Class 2 0.35–0.69
  // Class 3 0.70–3.49 | Class 4 3.50–17.49
  // Class 5 17.50–99.99 | Class 6 >=100.00
  rastClass:        smallint("rast_class"),
  // H = High | N = Normal | L = Low
  resultFlag:       varchar("result_flag", { length: 10 }),
  referenceRangeLow:  numeric("reference_range_low", { precision: 8, scale: 2 }),
  referenceRangeHigh: numeric("reference_range_high", { precision: 8, scale: 2 }),
  // true if rast_class >= 2 (value_kul >= 0.35)
  isSensitised:       boolean("is_sensitised").notNull(),
  // none | borderline | low | moderate | high | very_high | extreme
  sensitisationLevel: varchar("sensitisation_level", { length: 20 }).notNull(),
  loincCode:          varchar("loinc_code", { length: 20 }),
  fhirObservationId:  varchar("fhir_observation_id", { length: 200 }),
  createdAt:          timestamp("created_at").defaultNow().notNull(),
});

// ── Total IgE Results ────────────────────────────────────────
// One record per total IgE result per lab order
// Normal adult range: 0–100 kU/L (lab-dependent)
// Elevated (>150 kU/L) = independent atopic risk factor
export const totalIgeResults = pgTable("total_ige_results", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  patientId:           uuid("patient_id").notNull().references(() => patients.id),
  labOrderId:          uuid("lab_order_id").notNull().references(() => labOrders.id),
  // Standardised to kU/L on ingest
  valueKul:            numeric("value_kul", { precision: 8, scale: 2 }).notNull(),
  referenceRangeLow:   numeric("reference_range_low", { precision: 8, scale: 2 }),
  referenceRangeHigh:  numeric("reference_range_high", { precision: 8, scale: 2 }),
  resultFlag:          varchar("result_flag", { length: 10 }),
  fhirObservationId:   varchar("fhir_observation_id", { length: 200 }),
  createdAt:           timestamp("created_at").defaultNow().notNull(),
});

// ── Eosinophil Results ───────────────────────────────────────
// From full blood count (FBC/CBC)
// Normal absolute: <500 cells/µL | Normal %: <5%
// Elevated eosinophils support asthma severity scoring
// and biologic eligibility (Dupixent, Nucala, Fasenra)
export const eosinophilResults = pgTable("eosinophil_results", {
  id:                        uuid("id").primaryKey().defaultRandom(),
  patientId:                 uuid("patient_id").notNull().references(() => patients.id),
  labOrderId:                uuid("lab_order_id").notNull().references(() => labOrders.id),
  // Absolute eosinophil count in cells/µL
  absoluteCount:             integer("absolute_count"),
  // Eosinophil % of white cell count
  percentage:                numeric("percentage", { precision: 5, scale: 2 }),
  referenceRangeAbsoluteHigh: integer("reference_range_absolute_high"),
  referenceRangePctHigh:     numeric("reference_range_pct_high", { precision: 5, scale: 2 }),
  resultFlag:                varchar("result_flag", { length: 10 }),
  fhirObservationId:         varchar("fhir_observation_id", { length: 200 }),
  createdAt:                 timestamp("created_at").defaultNow().notNull(),
});

// ── Skin Prick Results ───────────────────────────────────────
// Clinician manual entry only
// One record per allergen per skin prick test session
// Positive threshold: wheal >= 3mm greater than negative control
export const skinPrickResults = pgTable("skin_prick_results", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  patientId:           uuid("patient_id").notNull().references(() => patients.id),
  labOrderId:          uuid("lab_order_id").notNull().references(() => labOrders.id),
  allergenId:          uuid("allergen_id").notNull().references(() => allergenCatalog.id),
  // AES-256 encrypted
  allergenName:        text("allergen_name").notNull(),
  // Wheal diameter in mm
  whealMm:             numeric("wheal_mm", { precision: 4, scale: 1 }).notNull(),
  histamineControlMm:  numeric("histamine_control_mm", { precision: 4, scale: 1 }).notNull(),
  salineControlMm:     numeric("saline_control_mm", { precision: 4, scale: 1 }),
  // true if wheal_mm >= histamine_control_mm - 3
  isPositive:          boolean("is_positive").notNull(),
  // Clinician who performed the test
  clinicianId:         uuid("clinician_id").notNull().references(() => users.id),
  testDate:            date("test_date").notNull(),
  // AES-256 encrypted — e.g. antihistamine washout noted
  notes:               text("notes"),
  createdAt:           timestamp("created_at").defaultNow().notNull(),
});

// ── Drug Reaction History ────────────────────────────────────
// Clinician-documented non-IgE drug reactions
// IgE-mediated drug allergies stored in allergen_results instead
export const drugReactionHistory = pgTable("drug_reaction_history", {
  id:          uuid("id").primaryKey().defaultRandom(),
  patientId:   uuid("patient_id").notNull().references(() => patients.id),
  clinicianId: uuid("clinician_id").notNull().references(() => users.id),
  // AES-256 encrypted
  drugName:            text("drug_name").notNull(),
  drugSnomedCode:      varchar("drug_snomed_code", { length: 20 }),
  // non_ige | intolerance | adverse_effect | unknown
  reactionType:        varchar("reaction_type", { length: 30 }).notNull(),
  // AES-256 encrypted
  reactionDescription: text("reaction_description").notNull(),
  // mild | moderate | severe | anaphylaxis
  severity:            varchar("severity", { length: 20 }),
  dateOfReaction:      date("date_of_reaction"),
  createdAt:           timestamp("created_at").defaultNow().notNull(),
});