import {
  pgTable, uuid, varchar, text, timestamp
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id:           uuid("id").primaryKey().defaultRandom(),

  // PHI — AES-256 encrypted
  fullName:     text("full_name").notNull(),

  // PHI — AES-256 encrypted (reversible for sending emails)
  email:        text("email").notNull(),

  // HMAC-SHA256 — one-way hash for safe DB lookups, never decryptable
  emailHash:    varchar("email_hash", { length: 64 }).notNull().unique(),

  passwordHash: text("password_hash").notNull(),         // bcrypt 12 rounds

  role:         varchar("role", { length: 30 }).notNull(), // patient | clinician | admin

  // active | invited | suspended | archived
  status:       varchar("status", { length: 20 }).notNull().default("active"),

  lastLoginAt:  timestamp("last_login_at"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});