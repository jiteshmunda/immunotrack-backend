import { Request, Response } from "express";
import { ClinicianService } from "./clinician.service";
import { createClinicianSchema } from "./clinician.schema";
import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";
import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";

const clinicianService = new ClinicianService();

export class ClinicianController {

  // ------------------------------POST /clinicians--------------------------------------------

  async create(req: Request, res: Response) {
    try {
      const validated = createClinicianSchema.parse(req.body);
      
      const result = await clinicianService.createClinician(validated);

      await writeAudit(req, {
        action: "CREATE_CLINICIAN",
        status: "success",
        userId: (req as AuthenticatedRequest).user.userId,
        resourceType: "clinician",
        resourceId: result.clinicianId,
      });

      return sendSuccess(res, {
        message: "Clinician created successfully",
        data: {
          clinicianId: result.clinicianId,
          temporaryPassword: result.tempPassword, 
        },
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ------------------------------GET /clinicians/patients------------------------------------

  async getAssignedPatients(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const result = await clinicianService.getAssignedPatients(userId);

      await writeAudit(req, {
        action: "VIEW_ASSIGNED_PATIENTS",
        status: "success",
        userId: userId,
        resourceType: "clinician",
        resourceId: userId,
      });

      return sendSuccess(res, {
        message: "Assigned patients fetched successfully",
        data: result,
      });
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }
}
