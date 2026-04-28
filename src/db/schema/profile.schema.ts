import {
  pgTable, uuid, varchar, text, timestamp, boolean, date
} from "drizzle-orm/pg-core";
import { users } from "./user.schema";
import { clinics } from "./clinic.schema";


// ── Patients ─────────────────────────────────────────────────
export const patients = pgTable("patients", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  userId:             uuid("user_id").notNull().references(() => users.id),

  // PHI — AES-256 encrypted
  dateOfBirth:        text("date_of_birth"),
  sex:                varchar("sex", { length: 20 }), // male | female | other | unknown

  // PHI — AES-256 encrypted
  phone:              text("phone"),
  mrn:                text("mrn"),
  primaryDiagnosis:   text("primary_diagnosis"),

  // Location for pollen/AQI API — not encrypted (zip only)
  locationZip:        varchar("location_zip", { length: 20 }),

  // RPM eligibility
  icd10QualifyingCode: varchar("icd10_qualifying_code", { length: 20 }), // e.g. J45.20
  rpmEnrollmentDate:  date("rpm_enrollment_date"),

  medicationRemindersEnabled: boolean("medication_reminders_enabled").default(true).notNull(),
  reminderTimeUtc: varchar("reminder_time_utc", { length: 5 }), // HH:MM
  fcmToken: text("fcm_token"),

  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  monitoringActive: boolean("monitoring_active").default(false).notNull(),

  createdAt:          timestamp("created_at").defaultNow().notNull(),

  updatedAt:          timestamp("updated_at").defaultNow().notNull(),
});

// ── Clinicians ───────────────────────────────────────────────
export const clinicians = pgTable("clinicians", {
  id:               uuid("id").primaryKey().defaultRandom(),
  userId:           uuid("user_id").notNull().references(() => users.id),
  clinicId:         uuid("clinic_id").references(() => clinics.id),

  // PHI — AES-256 encrypted

  licenseNumber:    text("license_number"),
  npiNumber:        text("npi_number"),
  phone:            text("phone"),
  stateOfLicensure: varchar("state_of_licensure", { length: 100 }),
  clinicalRole:     varchar("clinical_role", { length: 100 }),

  specialty:        varchar("specialty", { length: 100 }),
  organizationName: varchar("organization_name", { length: 255 }),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

// ── Care Teams ───────────────────────────────────────────────
export const careTeams = pgTable("care_teams", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Patient Clinician Assignments ────────────────────────────
export const patientClinicianAssignments = pgTable("patient_clinician_assignments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  patientId:   uuid("patient_id").notNull().references(() => patients.id),
  clinicianId: uuid("clinician_id").notNull().references(() => clinicians.id),
  careTeamId:  uuid("care_team_id").references(() => careTeams.id),
  isPrimary:   boolean("is_primary").default(false).notNull(),
  assignedAt:  timestamp("assigned_at").defaultNow().notNull(),
});

// ── Diagnoses catalog ────────────────────────────────────────
export const diagnoses = pgTable("diagnoses", {
  id:          uuid("id").primaryKey().defaultRandom(),
  icd10Code:   varchar("icd10_code", { length: 20 }).notNull().unique(),
  name:        varchar("name", { length: 255 }).notNull(),
  category:    varchar("category", { length: 100 }), // asthma | allergic_rhinitis | eczema | food_allergy
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

// ── Patient Diagnoses (junction) ─────────────────────────────
export const patientDiagnoses = pgTable("patient_diagnoses", {
  id:          uuid("id").primaryKey().defaultRandom(),
  patientId:   uuid("patient_id").notNull().references(() => patients.id),
  diagnosisId: uuid("diagnosis_id").notNull().references(() => diagnoses.id),
  diagnosedAt: date("diagnosed_at"),
  isPrimary:   boolean("is_primary").default(false).notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});