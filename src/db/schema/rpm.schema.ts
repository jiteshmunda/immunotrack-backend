import {
  pgTable, uuid, varchar, text, timestamp,
  boolean, date, integer, uniqueIndex
} from "drizzle-orm/pg-core";
import { patients } from "./profile.schema";
import { users } from "./user.schema";

// ── RPM Consents ─────────────────────────────────────────────
// consented_at IMMUTABLE — application layer must enforce no UPDATE
// enrollment_date anchors ALL rolling 30-day periods
export const rpmConsents = pgTable("rpm_consents", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  patientId:           uuid("patient_id").notNull().references(() => patients.id),
  // IMMUTABLE
  consentSignedAt:     timestamp("consent_signed_at").notNull(),
  // Anchors all rolling periods for this patient
  enrollmentDate:      date("enrollment_date").notNull(),
  // AES-256 encrypted
  icd10Code:           text("icd10_code").notNull(),
  // e.g. J45.20, J30.1, L20.x
  icd10QualifyingCode: text("icd10_qualifying_code").notNull(),

  // S3 URL — AES-256 encrypted
  consentPdfUrl:       text("consent_pdf_url"),
  consentVersion:      varchar("consent_version", { length: 20 }),
  // AES-256 encrypted
  deviceIdentifier:    text("device_identifier"),
  clinicianConfirmed:  boolean("clinician_confirmed").default(false).notNull(),
  // active | revoked | expired
  status:              varchar("status", { length: 20 }).notNull(),
  revokedAt:           timestamp("revoked_at"),
  createdAt:           timestamp("created_at").defaultNow().notNull(),
});

// ── RPM Rolling Periods (99445 / 99454) ──────────────────────
// Rolling 30-day from enrollment_date — NOT calendar month
// 99445 = 2–15 days | 99454 = 16+ days — MUTUALLY EXCLUSIVE
// patient_id + period_number UNIQUE (enforced by index below)
export const rpmRollingPeriods = pgTable("rpm_rolling_periods", {
  id:               uuid("id").primaryKey().defaultRandom(),
  patientId:        uuid("patient_id").notNull().references(() => patients.id),
  rpmConsentId:     uuid("rpm_consent_id").notNull().references(() => rpmConsents.id),
  periodNumber:     integer("period_number").notNull(),
  periodStart:      date("period_start").notNull(),
  periodEnd:        date("period_end").notNull(),
  transmissionDays: integer("transmission_days").default(0).notNull(),
  // none | 99445 | 99454
  cptTier:          varchar("cpt_tier", { length: 10 }).default("none"),
  // 2–15 days — NEW 2026
  cpt99445Eligible: boolean("cpt_99445_eligible").default(false).notNull(),
  // 16+ days
  cpt99454Eligible: boolean("cpt_99454_eligible").default(false).notNull(),
  // open | closed | billed
  periodStatus:     varchar("period_status", { length: 20 }).notNull(),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // CRITICAL: one period number per patient
  patientPeriodUnique: uniqueIndex("rpm_rolling_periods_patient_period_unique")
    .on(table.patientId, table.periodNumber),
}));

// ── RPM Calendar Periods (99457 / 99458 / 99470 / 99091) ─────
// Calendar month — resets 1st of month, NOT tied to enrollment
// 99470 and 99457 MUTUALLY EXCLUSIVE (not additive)
// patient_id + calendar_month UNIQUE (enforced by index below)
export const rpmCalendarPeriods = pgTable("rpm_calendar_periods", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  patientId:          uuid("patient_id").notNull().references(() => patients.id),
  rpmConsentId:       uuid("rpm_consent_id").notNull().references(() => rpmConsents.id),
  // e.g. '2026-04'
  calendarMonth:      varchar("calendar_month", { length: 7 }).notNull(),
  periodStart:        date("period_start").notNull(),
  periodEnd:          date("period_end").notNull(),
  transmissionDays:   integer("transmission_days").default(0).notNull(),
  reviewMinutesTotal: integer("review_minutes_total").default(0).notNull(),
  // 10–20 min — NEW 2026 — NOT additive with 99457
  cpt99470Eligible:   boolean("cpt_99470_eligible").default(false).notNull(),
  // 20+ min
  cpt99457Eligible:   boolean("cpt_99457_eligible").default(false).notNull(),
  // 40+ min add-on
  cpt99458Eligible:   boolean("cpt_99458_eligible").default(false).notNull(),
  // 30+ min physician personally
  cpt99091Eligible:   boolean("cpt_99091_eligible").default(false).notNull(),
  // open | closed | billed
  periodStatus:       varchar("period_status", { length: 20 }).notNull(),
  createdAt:          timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // CRITICAL: one calendar period per patient per month
  patientMonthUnique: uniqueIndex("rpm_calendar_periods_patient_month_unique")
    .on(table.patientId, table.calendarMonth),
}));

// ── RPM Clinician Time Logs ───────────────────────────────────
// IMMUTABLE after session close
// session_start and session_end — application layer enforces no UPDATE
export const rpmClinicianTimeLogs = pgTable("rpm_clinician_time_logs", {
  id:               uuid("id").primaryKey().defaultRandom(),
  calendarPeriodId: uuid("calendar_period_id").notNull().references(() => rpmCalendarPeriods.id),
  clinicianId:      uuid("clinician_id").notNull().references(() => users.id),
  patientId:        uuid("patient_id").notNull().references(() => patients.id),
  // IMMUTABLE after close
  sessionStart:     timestamp("session_start").notNull(),
  sessionEnd:       timestamp("session_end"),
  durationMinutes:  integer("duration_minutes"),
  // alert_response | patient_review | care_planning
  activityType:     varchar("activity_type", { length: 50 }),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

// ── RPM Billing Summaries ─────────────────────────────────────
// ONLY place rolling and calendar periods are joined
// Combines 99445/99454 (rolling) + 99457/99458/99470/99091 (calendar)
export const rpmBillingSummaries = pgTable("rpm_billing_summaries", {
  id:               uuid("id").primaryKey().defaultRandom(),
  patientId:        uuid("patient_id").notNull().references(() => patients.id),
  billingMonth:     varchar("billing_month", { length: 7 }).notNull(),
  rollingPeriodId:  uuid("rolling_period_id").references(() => rpmRollingPeriods.id),
  calendarPeriodId: uuid("calendar_period_id").references(() => rpmCalendarPeriods.id),
  // 99453 = initial setup — once per enrollment
  cpt99453Eligible: boolean("cpt_99453_eligible").default(false).notNull(),
  cpt99445Eligible: boolean("cpt_99445_eligible").default(false).notNull(),
  cpt99454Eligible: boolean("cpt_99454_eligible").default(false).notNull(),
  cpt99470Eligible: boolean("cpt_99470_eligible").default(false).notNull(),
  cpt99457Eligible: boolean("cpt_99457_eligible").default(false).notNull(),
  cpt99458Eligible: boolean("cpt_99458_eligible").default(false).notNull(),
  cpt99091Eligible: boolean("cpt_99091_eligible").default(false).notNull(),
  exportedAt:       timestamp("exported_at"),
  // AES-256 encrypted
  exportS3Key:      text("export_s3_key"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});