import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { patients, clinicians } from "./profile.schema";

export const patientClinicalNotes = pgTable("patient_clinical_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  clinicianId: uuid("clinician_id").notNull().references(() => clinicians.id),
  noteType: varchar("note_type", { length: 100 }).notNull(),
  notes: text("notes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
