import {
  pgTable, uuid, varchar, text, timestamp, foreignKey, boolean
} from "drizzle-orm/pg-core";
import { roles } from "./role.schema";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  // PHI — AES-256 encrypted
  fullName: varchar("full_name", { length: 255 }).notNull(),
  email: text("email").notNull(),
  emailHash: varchar("email_hash", { length: 64 }).notNull().unique(),
  passwordHash: text("password_hash"),
  roleId: uuid("role_id").references(() => roles.id),

  // active | invited | suspended | archived
  status: varchar("status", { length: 20 }).notNull().default("active"),

  lastLoginAt: timestamp("last_login_at"),

  // Security flags
  isTempPassword: boolean("is_temp_password").default(false).notNull(),
  passwordChangedAt: timestamp("password_changed_at").defaultNow().notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});