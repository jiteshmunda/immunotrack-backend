import { Request, Response } from "express";
import { AlertService } from "./alert.service";
import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";

const alertService = new AlertService();

export class AlertController {

  // ----------------------------------- GET /alerts ------------------------------------------
  
  async getAlerts(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const alerts = await alertService.getAlerts(user.userId, user.role);
      
      return sendSuccess(res, { alerts });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ------------------------------------- PATCH /alerts/:id/resolve ----------------------------------------

  async resolveAlert(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const { id } = req.params;
      const { resolution_note } = req.body;
      
      if (resolution_note !== undefined && resolution_note !== null) {
        if (typeof resolution_note !== "string") {
          throw new Error("RESOLUTION_NOTE_MUST_BE_STRING");
        }
        if (resolution_note.length > 500) {
          throw new Error("RESOLUTION_NOTE_TOO_LONG");
        }
      }

      const result = await alertService.resolveAlert(id as string, userId, resolution_note);

      await writeAudit(req, {
        action: "ALERT_RESOLVE",
        status: "success",
        userId: userId,
        resourceType: "alert",
        resourceId: id as string,
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }
}
