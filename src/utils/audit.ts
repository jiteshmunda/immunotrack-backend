import winston from "winston";
import path from "path";
import { Request } from "express";
import { db } from "../db";
import { auditLogs } from "../db/schema/compliance.schema";

export const auditLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join("logs", "audit.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 50,
    }),
    new winston.transports.File({
      filename: path.join("logs", "error.log"),
      level: "error",
    }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  auditLogger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

interface AuditOptions {
  action: string;
  status: "success" | "failure";
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>; 
}

export async function writeAudit(req: Request, opts: AuditOptions) {
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";

  // 1. Log to Winston (File)
  auditLogger.info({
    timestamp: new Date().toISOString(),
    action: opts.action,
    status: opts.status,
    userId: opts.userId ?? "anonymous",
    resourceType: opts.resourceType ?? "unknown",
    ip,
    userAgent,
    details: opts.details ?? {},
  });

  // 2. Log to Database (compliance.schema.auditLogs)
  try {
    await db.insert(auditLogs).values({
      userId: opts.userId,
      action: opts.action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      ipAddress: ip,
      userAgent: userAgent,
      status: opts.status,
      metadata: opts.details || {},
    });
  } catch (error) {
    auditLogger.error("Failed to write audit log to database", { error });
  }
}