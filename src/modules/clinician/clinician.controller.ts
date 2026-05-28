import { Request, Response } from "express";
import { ClinicianService } from "./clinician.service";
import { createClinicianSchema, addClinicalNoteSchema, updateClinicianProfileSchema } from "./clinician.schema";

import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";
import { AuthenticatedRequest } from "../../common/middleware/auth.middleware";

const clinicianService = new ClinicianService();

export class ClinicianController {

  // ------------------------------POST /clinicians--------------------------------------------

  async create(req: Request, res: Response) {
    try {
      const validated = createClinicianSchema.parse(req.body);
      const creatorId = (req as AuthenticatedRequest).user.userId;
      
      const result = await clinicianService.createClinician(validated, creatorId);

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

  // ------------------------------GET /clinicians/profile------------------------------------

  async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const result = await clinicianService.getProfile(userId);

      await writeAudit(req, {
        action: "READ_PHI",
        status: "success",
        userId: userId,
        resourceType: "clinician",
        resourceId: result.clinician_id,
      });

      return sendSuccess(res, { profile: result });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ------------------------------PUT /clinicians/profile------------------------------------

  async updateProfile(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const validated = updateClinicianProfileSchema.parse(req.body);

      const result = await clinicianService.updateProfile(userId, validated);

      await writeAudit(req, {
        action: "PROFILE_UPDATED",
        status: "success",
        userId: userId,
        resourceType: "clinician",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ------------------------------GET /clinicians/patients------------------------------------

  async getAssignedPatients(req: Request, res: Response) {
    try {
      const userId = (req as AuthenticatedRequest).user.userId;
      const { search } = req.query;
      
      const result = await clinicianService.getAssignedPatients(userId, search as string);

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

  // ------------------------------POST /clinicians/patients/:patientId/notes-------------------

  async addClinicalNote(req: Request, res: Response) {
    try {
      const clinicianUserId = (req as AuthenticatedRequest).user.userId;
      const { patientId } = req.params;
      
      const validated = addClinicalNoteSchema.parse(req.body);

      const result = await clinicianService.createClinicalNote(clinicianUserId, patientId as string, {
        noteType: validated.note_type,
        notes: validated.notes,
      });

      await writeAudit(req, {
        action: "ADD_CLINICAL_NOTE",
        status: "success",
        userId: clinicianUserId,
        resourceType: "patient",
        resourceId: patientId as string,
      });


      return sendSuccess(res, {
        message: "Clinical note added successfully",
        data: result,
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  // ------------------------------GET /clinicians/patients/:patientId/details-------------------

  async getPatientDetails(req: Request, res: Response) {
    try {
      const clinicianUserId = (req as AuthenticatedRequest).user.userId;
      const { patientId } = req.params;

      const result = await clinicianService.getPatientDetails(clinicianUserId, patientId as string);

      await writeAudit(req, {
        action: "VIEW_PATIENT_DETAILS",
        status: "success",
        userId: clinicianUserId,
        resourceType: "patient",
        resourceId: patientId as string,
      });

      return sendSuccess(res, {
        message: "Patient details fetched successfully",
        data: result,
      });
    } catch (error: any) {
      if (error.message === "UNAUTHORIZED_ACCESS_TO_PATIENT_DATA") {
        return sendError(res, error, 403);
      }
      return sendError(res, error, 404);
    }
  }

  // ------------------------------GET /clinicians/analytics-------------------

  async getAnalytics(req: Request, res: Response) {
    try {
      const clinicianUserId = (req as AuthenticatedRequest).user.userId;
      const result = await clinicianService.getClinicianAnalytics(clinicianUserId);

      await writeAudit(req, {
        action: "VIEW_POPULATION_ANALYTICS",
        status: "success",
        userId: clinicianUserId,
        resourceType: "population",
      });

      return sendSuccess(res, {
        message: "Clinician analytics fetched successfully",
        data: result,
      });
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }
}
