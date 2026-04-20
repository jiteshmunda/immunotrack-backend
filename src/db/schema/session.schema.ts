import {
  pgTable, uuid, text, timestamp
} from "drizzle-orm/pg-core";
import { users } from "./user.schema";

export const userSessions = pgTable("user_sessions", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     uuid("user_id").notNull().references(() => users.id),
  
  // HMAC-SHA256 of the refresh token
  tokenHash:  text("token_hash").notNull(),
  
  // For auditing and security
  ipAddress:  text("ip_address"),
  userAgent:  text("user_agent"),
  
  expiresAt:  timestamp("expires_at").notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});
