import { Request, Response } from "express";
import { AdminService } from "./admin.service";
import { createClinicianSchema } from "../clinician/clinician.schema";
import { createSystemAdminSchema } from "./admin.schema";
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

  async createSystemAdmin(req: Request, res: Response) {
    try {
      const validated = createSystemAdminSchema.parse(req.body);
      
      const result = await adminService.createSystemAdmin(validated);

      await writeAudit(req, {
        action: "CREATE_SYSTEM_ADMIN",
        status: "success",
        userId: (req as AuthenticatedRequest).user.userId,
        resourceType: "system_admin",
        resourceId: result.adminId,
      });

      return sendSuccess(res, {
        message: "System Admin created successfully",
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
      const filters = {
        status: req.query.status as string,
        role: req.query.role as string,
        clinical_role: req.query.clinical_role as string,
        search: req.query.search as string,
      };
      
      const clinicians = await adminService.getClinicians(adminId, filters);
      
      return sendSuccess(res, {
        message: "Clinicians fetched successfully",
        data: clinicians,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async getAnalytics(req: Request, res: Response) {
    try {
      const adminId = (req as AuthenticatedRequest).user.userId;
      const data = await adminService.getAnalytics(adminId);
      
      return sendSuccess(res, {
        message: "Analytics fetched successfully",
        data,
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

      const adminId = (req as AuthenticatedRequest).user.userId;
      const data = await adminService.getAuditLogs(adminId, filters);

      return sendSuccess(res, {
        message: "Audit logs fetched successfully",
        data,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async deleteClinician(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const clinicianId = req.params.id as string;

      if (!clinicianId) {
        throw new Error("Clinician ID is required");
      }

      const result = await adminService.deleteClinician(adminId, clinicianId);

      await writeAudit(req, {
        action: "CLINICIAN_DELETED",
        status: "success",
        userId: adminId,
        resourceType: "clinician",
        resourceId: clinicianId,
      });

      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error: any) {
      if (error.message.includes("Forbidden")) {
        return sendError(res, error, 403);
      }
      return sendError(res, error, 400);
    }
  }

  async getClinicianDetails(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const clinicianId = req.params.id as string;

      if (!clinicianId) {
        throw new Error("Clinician ID is required");
      }

      const clinician = await adminService.getClinicianDetails(adminId, clinicianId);

      await writeAudit(req, {
        action: "CLINICIAN_DETAILS_ACCESSED",
        status: "success",
        userId: adminId,
        resourceType: "clinician",
        resourceId: clinicianId,
      });

      return sendSuccess(res, {
        message: "Clinician details fetched successfully",
        data: clinician
      });
    } catch (error: any) {
      if (error.message.includes("Forbidden")) {
        return sendError(res, error, 403);
      }
      if (error.message.includes("not found")) {
        return sendError(res, error, 404);
      }
      return sendError(res, error, 400);
    }
  }

  async updateClinicianRole(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const clinicianId = req.params.id as string;
      const { new_role_name } = req.body;

      if (!clinicianId) {
        throw new Error("Clinician ID is required");
      }
      if (!new_role_name) {
        throw new Error("new_role_name is required");
      }

      const result = await adminService.updateClinicianRole(adminId, clinicianId, new_role_name);

      await writeAudit(req, {
        action: "CLINICIAN_ROLE_UPDATED",
        status: "success",
        userId: adminId,
        resourceType: "clinician",
        resourceId: clinicianId,
        details: { new_role_name }
      });

      return sendSuccess(res, {
        message: result.message
      });
    } catch (error: any) {
      if (error.message.includes("Forbidden")) {
        return sendError(res, error, 403);
      }
      if (error.message.includes("not found")) {
        return sendError(res, error, 404);
      }
      return sendError(res, error, 400);
    }
  }

  async transferPatients(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const { to_clinician_id, patient_ids } = req.body;

      if (!to_clinician_id) {
        throw new Error("to_clinician_id is required");
      }

      const result = await adminService.transferPatients(adminId, to_clinician_id, patient_ids);

      await writeAudit(req, {
        action: "PATIENTS_TRANSFERRED",
        status: "success",
        userId: adminId,
        resourceType: "clinician",
        resourceId: to_clinician_id,
        details: { patient_ids }
      });

      return sendSuccess(res, {
        message: result.message
      });
    } catch (error: any) {
      if (error.message.includes("Forbidden")) {
        return sendError(res, error, 403);
      }
      return sendError(res, error, 400);
    }
  }

  async getClinicianPatients(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const clinicianId = req.params.id as string;

      if (!clinicianId) {
        throw new Error("Clinician ID is required");
      }

      const filters = {
        status: req.query.status as string,
        search: req.query.search as string,
      };

      const patientsList = await adminService.getClinicianPatients(adminId, clinicianId, filters);

      await writeAudit(req, {
        action: "CLINICIAN_ROSTER_ACCESSED",
        status: "success",
        userId: adminId,
        resourceType: "clinician",
        resourceId: clinicianId,
      });

      return sendSuccess(res, {
        message: "Patients fetched successfully",
        data: patientsList
      });
    } catch (error: any) {
      if (error.message.includes("Forbidden")) {
        return sendError(res, error, 403);
      }
      if (error.message.includes("not found")) {
        return sendError(res, error, 404);
      }
      return sendError(res, error, 400);
    }
  }

  async getAllUsers(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const filters = {
        role: req.query.role as string,
        status: req.query.status as string,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      };

      const result = await adminService.getAllUsers(adminId, filters);

      await writeAudit(req, {
        action: "FETCH_USERS",
        status: "success",
        userId: adminId,
        resourceType: "user",
      });

      return sendSuccess(res, {
        message: "Users fetched successfully",
        data: result
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  async getUserDetails(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const userId = req.params.id as string;

      if (!userId) {
        throw new Error("User ID is required");
      }

      const user = await adminService.getUserDetails(adminId, userId);

      await writeAudit(req, {
        action: "FETCH_USER_DETAILS",
        status: "success",
        userId: adminId,
        resourceType: "user",
        resourceId: userId,
      });

      return sendSuccess(res, {
        message: "User details fetched successfully",
        data: user
      });
    } catch (error: any) {
      if (error.message.includes("not found")) {
        return sendError(res, error, 404);
      }
      return sendError(res, error, 400);
    }
  }

  async updateUserStatus(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const userId = req.params.id as string;
      const { status } = req.body;

      if (!userId) {
        throw new Error("User ID is required");
      }
      if (!status) {
        throw new Error("Status is required");
      }

      const user = await adminService.updateUserStatus(adminId, userId, status);

      await writeAudit(req, {
        action: "UPDATE_USER_STATUS",
        status: "success",
        userId: adminId,
        resourceType: "user",
        resourceId: userId,
        details: { status }
      });

      return sendSuccess(res, {
        message: "User status updated successfully",
        data: user
      });
    } catch (error: any) {
      if (error.message.includes("not found")) {
        return sendError(res, error, 404);
      }
      return sendError(res, error, 400);
    }
  }

  async deleteUser(req: Request, res: Response) {
    try {
      const adminId = (req as any).user.userId;
      const userId = req.params.id as string;

      if (!userId) {
        throw new Error("User ID is required");
      }

      const user = await adminService.deleteUser(adminId, userId);

      await writeAudit(req, {
        action: "DELETE_USER",
        status: "success",
        userId: adminId,
        resourceType: "user",
        resourceId: userId,
      });

      return sendSuccess(res, {
        message: "User deleted successfully",
      });
    } catch (error: any) {
      if (error.message.includes("not found")) {
        return sendError(res, error, 404);
      }
      return sendError(res, error, 400);
    }
  }

  // ------------------------------------- GET /patients ------------------------------------------

  async getOrgPatients(req: Request, res: Response) {
    try {
      const adminId = (req as AuthenticatedRequest).user.userId;
      const filters = req.query as { status?: string; clinician_id?: string; search?: string; limit?: string; offset?: string };
      
      const result = await adminService.getOrgPatients(adminId, filters);
      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ------------------------------------- GET /patients/:id ------------------------------------------

  async getOrgPatientDetails(req: Request, res: Response) {
    try {
      const adminId = (req as AuthenticatedRequest).user.userId;
      const { id } = req.params;
      
      const result = await adminService.getOrgPatientDetails(adminId, id as string);
      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }
}
