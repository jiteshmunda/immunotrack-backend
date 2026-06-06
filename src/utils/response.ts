import { Response } from "express";
import { ZodError } from "zod";
import { auditLogger } from "./audit";
import { ERROR_TRANSLATIONS } from "./error-translations";

export const sendSuccess = (res: Response, data: object, status = 200) =>
  res.status(status).json({ success: true, ...data });


export const sendError = (res: Response, error: any, status = 400) => {
  const { sanitizedMessage, technicalDetails, statusCode, validationErrors } = sanitizeError(error, status);
  
  const redactedTechnicalDetails = redactData(technicalDetails);

  auditLogger.error("API_ERROR_LOG", { 
    status: statusCode,
    technicalDetails: redactedTechnicalDetails,
    timestamp: new Date().toISOString()
  });

  const responseBody: any = {
    success: false,
    message: sanitizedMessage
  };

  if (validationErrors) {
    responseBody.errors = validationErrors;
  }

  return res.status(statusCode).json(responseBody);
};


function sanitizeError(error: any, defaultStatus: number) {
  let sanitizedMessage = "An unexpected error occurred";
  let technicalDetails: any = { name: "Error" };
  let statusCode = defaultStatus;
  let validationErrors: any = undefined;

  if (error instanceof ZodError) {
    sanitizedMessage = "Validation failed. Please check your inputs.";
    
    const groupedErrors = new Map<string, string[]>();
    
    error.issues.forEach((e: any) => {
      const pathKey = e.path.join(".");
      const combined = `${pathKey}: ${e.message}`;
      
      let msg = ERROR_TRANSLATIONS[combined] || ERROR_TRANSLATIONS[e.message];
      
      if (!msg) {
        msg = e.message.replace(/\\"/g, "'").replace(/"/g, "'");
        if (msg.includes("Invalid option: expected one of")) {
          msg = "Please select a valid option.";
        } else if (msg.includes("String must contain at least")) {
          msg = "This field cannot be empty.";
        } else if (msg.includes("Expected") && msg.includes("received")) {
          msg = "Invalid data format provided.";
        } else if (msg === "Required") {
          msg = "This field is required.";
        }
      }

      if (!groupedErrors.has(pathKey)) {
        groupedErrors.set(pathKey, []);
      }
      
      if (!groupedErrors.get(pathKey)!.includes(msg)) {
        groupedErrors.get(pathKey)!.push(msg);
      }
    });

    function combineMessages(messages: string[]): string {
      if (!messages || messages.length === 0) return "";
      if (messages.length === 1) return messages[0];

      let result = messages[0];
      
      for (let i = 1; i < messages.length; i++) {
        const prevWords = messages[i - 1].split(" ");
        const currWords = messages[i].split(" ");
        
        let matchIndex = 0;
        while (
          matchIndex < prevWords.length && 
          matchIndex < currWords.length && 
          prevWords[matchIndex].toLowerCase() === currWords[matchIndex].toLowerCase()
        ) {
          matchIndex++;
        }
        
        if (matchIndex > 0) {
          result += ", " + currWords.slice(matchIndex).join(" ");
        } else {
          result += ", " + messages[i];
        }
      }
      return result;
    }

    validationErrors = Array.from(groupedErrors.entries()).map(([field, messages]) => ({
      field,
      message: combineMessages(messages)
    }));
    
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
      sanitizedMessage = "An internal database error occurred.";
      technicalDetails = {
        name: errorName,
        message: "Database Query Error (Redacted)"
      };
      statusCode = 500; // Force 500 for unhandled DB errors
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
      statusCode = 500;
    }
  } else if (typeof error === "string") {
    if (ERROR_TRANSLATIONS[error]) {
      sanitizedMessage = ERROR_TRANSLATIONS[error];
      technicalDetails = { message: error };
    } else {
      sanitizedMessage = "An unexpected error occurred.";
      technicalDetails = { message: "Raw string error redacted to prevent PHI leakage" };
      statusCode = 500;
    }
  }

  return { sanitizedMessage, technicalDetails, statusCode, validationErrors };
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