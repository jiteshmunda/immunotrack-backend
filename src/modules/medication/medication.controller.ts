import { Response, Request } from "express";
import { MedicationService } from "./medication.service";
import { addMedicationSchema } from "./medication.schema";
import { logMedicationSchema, createReminderSchema, updateReminderSchema } from "./medication.validation";
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
        resourceId: result.id as string,
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
        resourceId: result.id as string,
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

  // ------------------------- POST /medications/reminders -------------------------

  async setReminder(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const input = createReminderSchema.parse(req.body);
      const userId = authReq.user.userId;

      const reminder = await medicationService.createReminder(userId, input);

      const auditId = Array.isArray(reminder) ? reminder[0]?.id : reminder.id;

      await writeAudit(req, {
        action: "REMINDER_CREATED",
        status: "success",
        userId: userId,
        resourceId: auditId as string,
        resourceType: "medication_reminder",
      });

      return sendSuccess(res, reminder, 201);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

   // ------------------------- GET /medications/reminders -------------------------

  async getReminders(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const reminders = await medicationService.getReminders(authReq.user.userId);
      return sendSuccess(res, reminders);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }

  // ---------------------------------- PATCH /medications/reminders/:id --------------------------------
  async toggleReminder(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = req.params.id as string;
      const parsedBody = updateReminderSchema.parse(req.body);
      const userId = authReq.user.userId;

      const reminder = await medicationService.updateReminder(userId, id, parsedBody);

      await writeAudit(req, {
        action: "REMINDER_TOGGLED",
        status: "success",
        userId: userId,
        resourceId: id,
        resourceType: "medication_reminder",
      });

      return sendSuccess(res, reminder);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ---------------------------------- DELETE /medications/reminders/:id -------------------------------

  async deleteReminder(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = req.params.id as string;
      const userId = authReq.user.userId;

      const result = await medicationService.deleteReminder(userId, id);

      await writeAudit(req, {
        action: "REMINDER_DELETED",
        status: "success",
        userId: userId,
        resourceId: id,
        resourceType: "medication_reminder",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ---------------------------------- GET /medications/adherence --------------------------------------
  async getAdherenceMetrics(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const { patientId, rangeDays } = req.query;
      const { userId, role } = authReq.user;

      const result = await medicationService.getAdherenceMetrics(
        userId,
        role,
        patientId as string,
        rangeDays ? parseInt(rangeDays as string) : undefined
      );

      return sendSuccess(res, result);
    } catch (error: any) {
      const status = error.message.includes("UNAUTHORIZED") ? 403 : 
                    error.message.includes("NOT_FOUND") ? 404 : 400;
      return sendError(res, error, status);
    }
  }

  // ---------------------------------- GET /medications/missed --------------------------------------
  async getRecentMissedMedications(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const result = await medicationService.getRecentMissedMedications(authReq.user.userId);
      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }
  // ---------------------------------- PUT /medications/missed/:id/resolve --------------------------------
  async resolveMissedLog(req: Request, res: Response) {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = req.params.id as string;
      const { takenTime } = req.body;

      if (!takenTime) {
        throw new Error("takenTime is required");
      }

      const result = await medicationService.resolveMissedLog(authReq.user.userId, id, takenTime);

      await writeAudit(req, {
        action: "MISSED_LOG_RESOLVED",
        status: "success",
        userId: authReq.user.userId,
        resourceId: id,
        resourceType: "missed_medication_log",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      const status = error.message.includes("EXPIRED") ? 400 : 
                    error.message.includes("NOT_FOUND") ? 404 : 400;
      return sendError(res, error, status);
    }
  }
}
