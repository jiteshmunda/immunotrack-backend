import { Response, Request } from "express";
import { MedicationService } from "./medication.service";
import { addMedicationSchema } from "./medication.schema";
import { logMedicationSchema } from "./medication.validation";
import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";
import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";

const medicationService = new MedicationService();

export class MedicationController {

  //  ------------------------GET /medications/catalog----------------------------------------------

  async getCatalog(req: Request, res: Response) {
    try {
      const result = await medicationService.getCatalog();
      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }


  //  ------------------------POST /medications-----------------------------------------------------

  async addMedication(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = addMedicationSchema.parse(req.body);

      const result = await medicationService.addMedicationToPlan(
        authReq.user.userId,
        validated
      );

      await writeAudit(req, {
        action: "MEDICATION_ADDED",
        status: "success",
        userId: authReq.user.userId,
        resourceId: result.id,
        resourceType: "medication_plan",
      });

      return sendSuccess(res, result, 201);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }


  // -------------------------------------------GET /medications-------------------------------------------------

  async getMedicationPlan(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const result = await medicationService.getMedicationPlan(authReq.user.userId);
      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }

 
  // ---------------------------------------------DELETE /medications/:id------------------------------------------------------

  async deleteMedication(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = req.params.id as string;

      const result = await medicationService.deleteMedicationFromPlan(
        authReq.user.userId,
        id
      );

      await writeAudit(req, {
        action: "MEDICATION_DELETED",
        status: "success",
        userId: authReq.user.userId,
        resourceId: id,
        resourceType: "medication_plan",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ---------------------------------- POST /medications/logs ------------------------------------------
  async logMedication(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = logMedicationSchema.parse(req.body);

      const result = await medicationService.logMedication(
        authReq.user.userId,
        validated
      );

      await writeAudit(req, {
        action: "MEDICATION_LOGGED",
        status: "success",
        userId: authReq.user.userId,
        resourceId: result.id,
        resourceType: "medication_log",
      });

      return sendSuccess(res, result, 201);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ---------------------------------- GET /medications/logs -------------------------------------------
  async getMedicationLogs(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const { startDate, endDate } = req.query;

      const result = await medicationService.getMedicationLogs(authReq.user.userId, {
        startDate: startDate as string,
        endDate: endDate as string,
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }
}
