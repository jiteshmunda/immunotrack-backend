import { Response } from "express";
import { ZodError } from "zod";
import { auditLogger } from "./audit";
import { ERROR_TRANSLATIONS } from "./error-translations";

export const sendSuccess = (res: Response, data: object, status = 200) =>
  res.status(status).json({ success: true, ...data });


export const sendError = (res: Response, error: any, status = 400) => {
  const { sanitizedMessage, technicalDetails } = sanitizeError(error);
  
  const redactedTechnicalDetails = redactData(technicalDetails);

  auditLogger.error("API_ERROR_LOG", { 
    status,
    technicalDetails: redactedTechnicalDetails,
    timestamp: new Date().toISOString()
  });

  return res.status(status).json({ 
    success: false, 
    message: sanitizedMessage 
  });
};


function sanitizeError(error: any) {
  let sanitizedMessage = "An unexpected error occurred";
  let technicalDetails: any = { name: "Error" };

  if (error instanceof ZodError) {
    sanitizedMessage = error.issues
      .map((e: any) => {
        const pathKey = e.path.join(".");
        const combined = `${pathKey}: ${e.message}`;
        return ERROR_TRANSLATIONS[combined] || ERROR_TRANSLATIONS[e.message] || combined;
      })
      .join(", ");
    
    technicalDetails = { 
      type: "ZodError", 
      issues: error.issues.map((issue: any) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message.replace(/received\s+['"].*?['"]/gi, "received '[REDACTED]'")
      }))
    };
  } else if (error instanceof Error) {
    const rawMessage = error.message;
    const errorName = error.name;

    const sqlKeywords = ["select", "insert", "update", "delete", "from", "where", "returning", "Failed query:"];
    const isSqlLeaked = sqlKeywords.some(k => rawMessage.toLowerCase().includes(k)) || rawMessage.includes("\"");

    if (isSqlLeaked) {
      sanitizedMessage = "Internal processing error. The clinical record could not be updated.";
      technicalDetails = {
        name: errorName,
        message: "Database Query Error (Redacted)"
      };
    } else if (ERROR_TRANSLATIONS[rawMessage]) {
      sanitizedMessage = ERROR_TRANSLATIONS[rawMessage];
      technicalDetails = {
        name: errorName,
        message: rawMessage
      };
    } else {
      sanitizedMessage = "An unexpected error occurred while processing your request.";
      technicalDetails = {
        name: errorName,
        message: "Internal Error (Raw message redacted to prevent PHI leakage)"
      };
    }
  } else if (typeof error === "string") {
    if (ERROR_TRANSLATIONS[error]) {
      sanitizedMessage = ERROR_TRANSLATIONS[error];
      technicalDetails = { message: error };
    } else {
      sanitizedMessage = "An unexpected error occurred.";
      technicalDetails = { message: "Raw string error redacted to prevent PHI leakage" };
    }
  }

  return { sanitizedMessage, technicalDetails };
}


function redactData(data: any): any {
  if (!data) return data;

  if (typeof data === "string") {
    return data
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED]")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[REDACTED]")
      .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, "[REDACTED]")
      .replace(/-- params: \[.*?\]/g, "-- params: [REDACTED]")
      .replace(/[a-zA-Z]:\\(?:[^\\:]+\\)+/g, "[PATH]\\")
      .replace(/\/(?:[^\/ ]+\/)+/g, "[PATH]/");
  }

  if (Array.isArray(data)) {
    return data.map(redactData);
  }

  if (typeof data === "object") {
    const redacted: any = {};
    for (const key in data) {
      const sensitiveKeys = ["email", "fullName", "password", "phone", "dateOfBirth", "received", "expected", "mrn", "ipAddress"];
      if (sensitiveKeys.includes(key)) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactData(data[key]);
      }
    }
    return redacted;
  }

  return data;
}