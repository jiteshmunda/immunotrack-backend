import winston from "winston";
import path from "path";
import { Request } from "express";

const auditLogger = winston.createLogger({
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
  details?: Record<string, unknown>; 
}

export function writeAudit(req: Request, opts: AuditOptions) {
  auditLogger.info({
    timestamp: new Date().toISOString(),
    action: opts.action,
    status: opts.status,
    userId: opts.userId ?? "anonymous",
    resourceType: opts.resourceType ?? "unknown",
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers["user-agent"] ?? "unknown",
    details: opts.details ?? {},
  });
}