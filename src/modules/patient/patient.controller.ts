import { Request, Response } from "express";
import { PatientService } from "./patient.service";
import { updatePatientProfileSchema, patientConsentSchema } from "./patient.schema";
import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";

const patientService = new PatientService();

export class PatientController {

  // -----------------------------GET /api/v1/patient/profile------------------------------------------
  
  async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const result = await patientService.getProfile(userId);

      await writeAudit(req, {
        action: "READ_PHI",
        status: "success",
        userId: userId,
        resourceType: "patient",
        resourceId: result.patient_id,
      });

      return sendSuccess(res, { profile: result });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

// -----------------------------PUT /api/v1/patient/profile------------------------------------------

  async updateProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const validated = updatePatientProfileSchema.parse(req.body);

      const result = await patientService.updateProfile(
        userId,
        validated
      );

      await writeAudit(req, {
        action: "PROFILE_UPDATED",
        status: "success",
        userId: userId,
        resourceType: "patient",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }


// --------------------------POST /api/v1/patient/consent------------------------------

  async recordConsent(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const validated = patientConsentSchema.parse(req.body);

      const result = await patientService.recordConsent(userId, validated, req.ip);

      await writeAudit(req, {
        action: "CONSENT_RECORDED",
        status: "success",
        userId: userId,
        resourceType: "patient_consent",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

// --------------------------GET /api/v1/patient/dashboard------------------------------

  async getDashboard(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const result = await patientService.getDashboardData(userId);

      await writeAudit(req, {
        action: "READ_PHI",
        status: "success",
        userId: userId,
        resourceType: "patient_dashboard",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }
}
