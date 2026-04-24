import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const medicationCatalog = pgTable("medication_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // External ID from reference dataset (e.g., AH-001) - unique to prevent double seeding
  externalId: varchar("external_id", { length: 50 }).notNull().unique(),
  
  name: varchar("name", { length: 255 }).notNull(),
  genericName: varchar("generic_name", { length: 255 }),
  brandNames: text("brand_names"), 
  
  category: varchar("category", { length: 100 }).notNull(),
  subCategory: varchar("sub_category", { length: 100 }),
  
  route: varchar("route", { length: 50 }),
  standardDose: text("standard_dose"),
  availableStrengths: text("available_strengths"),
  defaultFrequency: varchar("frequency", { length: 100 }),
  
  indicatedFor: text("indicated_for"),
  rxOtc: varchar("rx_otc", { length: 20 }), // Rx | OTC
  clinicalNotes: text("clinical_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
