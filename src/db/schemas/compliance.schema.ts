import {
  pgTable, uuid, varchar, text, timestamp,
  boolean, date, integer, jsonb
} from "drizzle-orm/pg-core";
import { patients } from "./profile.schema";
import { users } from "./user.schema";

// ── Patient Export Requests ───────────────────────────────────
// HIPAA-mandated audit table — 45 CFR § 164.524
// One record per export request — NEVER deleted
// requested_at and reauth_at are IMMUTABLE — no UPDATE permitted
// When file expires: set status = 'expired', null file_s3_key
// Retained minimum 6 years per HIPAA requirements
export const patientExportRequests = pgTable("patient_export_requests", {
  id:        uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),

  // IMMUTABLE — exact timestamp of export initiation
  requestedAt: timestamp("requested_at").notNull(),

  // full_record | symptom_logs | lab_results | medications | rpm_record
  scope:  varchar("scope", { length: 30 }).notNull(),

  // pdf | fhir_json | csv
  format: varchar("format", { length: 10 }).notNull(),

  // null for scopes without date filter
  dateRangeStart: date("date_range_start"),
  dateRangeEnd:   date("date_range_end"),

  // instant | email — determined server-side based on scope + size
  deliveryMethod: varchar("delivery_method", { length: 10 }).notNull(),

  // pending | generating | complete | failed | expired
  status: varchar("status", { length: 20 }).notNull(),

  // S3 object key — nulled after file deletion — AES-256 encrypted
  fileS3Key: text("file_s3_key"),

  // Size of generated file in bytes
  fileSizeBytes: integer("file_size_bytes"),

  // Expiry of signed S3 URL — 15 min (instant) or 24 hrs (email)
  downloadUrlExpiresAt: timestamp("download_url_expires_at"),

  // Timestamp of first and only download — null if not yet downloaded
  downloadedAt: timestamp("downloaded_at"),

  // null for instant downloads
  emailSentAt:    timestamp("email_sent_at"),
  emailDelivered: boolean("email_delivered"),

  // biometric | password — IMMUTABLE
  reauthMethod: varchar("reauth_method", { length: 20 }).notNull(),

  // IMMUTABLE — timestamp of re-authentication
  // Must be within 5 minutes of requested_at
  reauthAt: timestamp("reauth_at").notNull(),

  // Patient device IP — HIPAA audit requirement
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),

  // Device and app version identifier
  userAgent: text("user_agent"),

  // Internal error detail if status = failed
  // NEVER exposed to patient
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Notifications ────────────────────────────────────────────
// Patient and clinician notifications
// Types:
// Patient: medication_reminder | symptom_reminder | ai_insight | clinician_message
// Clinician: patient_deterioration | nonadherence_alert | high_risk_alert
export const notifications = pgTable("notifications", {
  id:     uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),

  // medication_reminder | symptom_reminder | ai_insight
  // clinician_message | patient_deterioration
  // nonadherence_alert | high_risk_alert | rpm_transmission_at_risk
  type: varchar("type", { length: 50 }).notNull(),

  // PHI — AES-256 encrypted
  title: text("title").notNull(),
  body:  text("body").notNull(),

  readAt:    timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Audit Logs ───────────────────────────────────────────────
// HIPAA-required audit trail of ALL system actions
// Covers: PHI access, login, export, lab result access,
// RPM consent, clinician time sessions
// NEVER store PHI in this table — only IDs, actions, metadata
// Retained minimum 6 years per HIPAA requirements
export const auditLogs = pgTable("audit_logs", {
  id:     uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),

  // REGISTER | LOGIN | LOGOUT | READ_PHI | UPDATE_PHI
  // EXPORT_REQUEST | LAB_ACCESS | RPM_CONSENT
  // RPM_TIME_START | RPM_TIME_END | ALERT_RESOLVE
  action: varchar("action", { length: 100 }).notNull(),

  // user | patient | lab_order | alert | rpm_consent | export
  resourceType: varchar("resource_type", { length: 100 }),

  // ID of the resource being accessed — never PHI itself
  resourceId: uuid("resource_id"),

  // IPv4 or IPv6
  ipAddress: varchar("ip_address", { length: 45 }),

  userAgent: text("user_agent"),

  // success | failure
  status: varchar("status", { length: 20 }),

  // JSON metadata — NO PHI ever
  // e.g. { role: "clinician", scope: "lab_results", reason: "validation_error" }
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});