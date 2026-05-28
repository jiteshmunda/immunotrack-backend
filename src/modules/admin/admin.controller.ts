import { Request, Response } from "express";
import { AdminService } from "./admin.service";
import { createClinicianSchema } from "../clinician/clinician.schema";
import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";
import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";

const adminService = new AdminService();

export class AdminController {
  async create(req: Request, res: Response) {
    try {
      const validated = createClinicianSchema.parse(req.body);
      
      const result = await adminService.createAdmin(validated);

      await writeAudit(req, {
        action: "CREATE_ADMIN",
        status: "success",
        userId: (req as AuthenticatedRequest).user.userId,
        resourceType: "admin",
        resourceId: result.adminId,
      });

      return sendSuccess(res, {
        message: "Admin created successfully",
        data: {
          adminId: result.adminId,
          temporaryPassword: result.tempPassword,
        },
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async getClinicians(req: Request, res: Response) {
    try {
      const adminId = (req as AuthenticatedRequest).user.userId;
      const clinicians = await adminService.getClinicians(adminId);
      
      return sendSuccess(res, {
        message: "Clinicians fetched successfully",
        data: clinicians,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async getPopulationDashboard(req: Request, res: Response) {
    try {
      const adminId = (req as AuthenticatedRequest).user.userId;
      const data = await adminService.getPopulationDashboard(adminId);
      
      return sendSuccess(res, {
        message: "Population dashboard fetched successfully",
        data,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async getAdherenceAnalytics(req: Request, res: Response) {
    try {
      const adminId = (req as AuthenticatedRequest).user.userId;
      const data = await adminService.getAdherenceAnalytics(adminId);
      
      return sendSuccess(res, {
        message: "Adherence analytics fetched successfully",
        data,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async getSymptomAnalytics(req: Request, res: Response) {
    try {
      const adminId = (req as AuthenticatedRequest).user.userId;
      const data = await adminService.getSymptomAnalytics(adminId);
      
      return sendSuccess(res, {
        message: "Symptom analytics fetched successfully",
        data,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async getRiskClusterAnalytics(req: Request, res: Response) {
    try {
      const adminId = (req as AuthenticatedRequest).user.userId;
      const data = await adminService.getRiskClusterAnalytics(adminId);
      
      return sendSuccess(res, {
        message: "Risk cluster analytics fetched successfully",
        data,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async getAuditLogs(req: Request, res: Response) {
    try {
      const filters = {
        patient_id: req.query.patient_id as string,
        user_id: req.query.user_id as string,
        action_type: req.query.action_type as string,
        date_from: req.query.date_from as string,
        date_to: req.query.date_to as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const data = await adminService.getAuditLogs(filters);

      return sendSuccess(res, {
        message: "Audit logs fetched successfully",
        data,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }
}
