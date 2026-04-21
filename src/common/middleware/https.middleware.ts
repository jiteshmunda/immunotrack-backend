import { Request, Response, NextFunction } from "express";

/**
 * Ensures that sensitive HIPAA routes (like invite generation and verification)
 * are only ever accessed over a secure TLS/HTTPS connection.
 */
export const requireHttps = (req: Request, res: Response, next: NextFunction) => {
  // Allow localhost bypass during development, but enforce in production
  if (process.env.NODE_ENV !== "production" && req.hostname === "localhost") {
    return next();
  }

  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    return next();
  } else {
    res.status(403).json({
      success: false,
      message: "HTTPS/TLS 1.2+ is strictly required for this operation due to HIPAA compliance policies.",
    });
  }
};
