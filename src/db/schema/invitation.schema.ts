import {
  pgTable, uuid, varchar, timestamp, integer, text, pgEnum
} from "drizzle-orm/pg-core";
import { clinicians, patients } from "./profile.schema";
import { clinics } from "./clinic.schema";

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "redeemed",
  "expired",
  "invalidated"
]);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // 12-char cryptographically random code — uppercase alphanumeric — indexed, unique
  inviteCode: varchar("invite_code", { length: 12 }).notNull().unique(),
  
  // Formatted with dashes for display: IMMU-A3K7-X9PQ (14 chars)
  inviteCodeDisplay: varchar("invite_code_display", { length: 14 }).notNull(),
  
  clinicianId: uuid("clinician_id")
    .notNull()
    .references(() => clinicians.id),
    
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id),
    
  // PHI - Encrypted at rest
  patientEmail: text("patient_email").notNull(),
  patientFirstName: text("patient_first_name").notNull(),
  patientLastName: text("patient_last_name").notNull(),
  patientDob: text("patient_dob").notNull(),
  
  // Primary diagnosis code: 'allergy', 'asthma', or 'both'
  patientDiagnosis: varchar("patient_diagnosis", { length: 50 }).notNull(),
  icd10Code: varchar("icd10_code", { length: 20 }),
  
  rpmEnrolled: varchar("rpm_enrolled", { length: 10 }).default("false"), 
  personalMessage: text("personal_message"),

  status: varchar("status", { length: 20 }).notNull().default("pending"),
  
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  
  emailSentAt: timestamp("email_sent_at"),
  redemptionAttemptedAt: timestamp("redemption_attempted_at"),
  redeemedAt: timestamp("redeemed_at"),
  redeemedByPatientId: uuid("redeemed_by_patient_id").references(() => patients.id),
  
  failedAttempts: integer("failed_attempts").default(0).notNull(),
  
  resendCount: integer("resend_count").default(0).notNull(),
  lastResentAt: timestamp("last_resent_at"),
  
  invalidatedAt: timestamp("invalidated_at"),
  invalidatedReason: varchar("invalidated_reason", { length: 100 }), // 'resent' | 'clinician_cancelled' | 'admin_action'

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
