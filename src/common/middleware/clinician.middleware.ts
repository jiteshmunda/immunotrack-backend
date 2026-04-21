import { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { clinicians } from "../../db/schema/profile.schema";
import { eq } from "drizzle-orm";
import { sendError } from "../../utils/response";
import { AuthenticatedRequest } from "./auth.middleware";

export interface ClinicianRequest extends Request {
  user: {
    userId: string;
    role: string;
    sid: string;
  };
  clinicianId: string;
  clinicianName: string;
}

/**
 * Middleware to resolve the Clinician Profile from the authenticated User ID.
 * Must be used after authenticateJWT and requireRole(['clinician']).
 */
export async function resolveClinicianProfile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;

    if (!userId) {
      return sendError(res, "Unauthorized: No user session found", 401);
    }

    const [clinician] = await db
      .select({ 
        id: clinicians.id,
        name: clinicians.organizationName 
      })
      .from(clinicians)
      .where(eq(clinicians.userId, userId))
      .limit(1);

    if (!clinician) {
      return sendError(res, "CLINICIAN_PROFILE_NOT_FOUND", 404);
    }

    const clinicianReq = req as ClinicianRequest;
    clinicianReq.clinicianId = clinician.id;
    clinicianReq.clinicianName = clinician.name || "Your Provider";
    
    next();
  } catch (error: any) {
    console.error("Clinician Profile Resolution Error:", error);
    return sendError(res, "Failed to resolve clinician profile", 500);
  }
}

