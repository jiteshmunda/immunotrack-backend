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

      await writeAudit(req, {
        action: "REMINDER_CREATED",
        status: "success",
        userId: userId,
        resourceId: reminder.id as string,
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
      const { active, time } = updateReminderSchema.parse(req.body);
      const userId = authReq.user.userId;

      const reminder = await medicationService.updateReminder(userId, id, { active, time });

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
}
