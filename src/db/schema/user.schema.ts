import {
  pgTable, uuid, varchar, text, timestamp, foreignKey, boolean, integer
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

  // Account Lockout
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),

  lastLoginAt: timestamp("last_login_at"),

  // Security flags
  isTempPassword: boolean("is_temp_password").default(false).notNull(),
  passwordChangedAt: timestamp("password_changed_at").defaultNow().notNull(),
  termsAccepted: boolean("terms_accepted").default(false).notNull(),

  // Email Update (OTP)
  pendingEmail: text("pending_email"),
  emailUpdateOtp: varchar("email_update_otp", { length: 64 }),
  emailUpdateExpires: timestamp("email_update_expires"),
  emailUpdateAttempts: integer("email_update_attempts").default(0).notNull(),
  emailUpdateRequestedAt: timestamp("email_update_requested_at"),

  // Password Reset (OTP)
  resetPasswordOtp: varchar("reset_password_otp", { length: 64 }),
  resetPasswordExpires: timestamp("reset_password_expires"),
  resetPasswordAttempts: integer("reset_password_attempts").default(0).notNull(),
  resetPasswordRequestedAt: timestamp("reset_password_requested_at"),

  // MFA Login (OTP)
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  loginOtp: varchar("login_otp", { length: 64 }),
  loginOtpExpires: timestamp("login_otp_expires"),
  loginOtpAttempts: integer("login_otp_attempts").default(0).notNull(),

  profilePicture: text("profile_picture"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const passwordHistory = pgTable("password_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});