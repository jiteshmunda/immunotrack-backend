import { Request, Response } from "express";
import { InvitationService } from "./invitation.service";
import {
  invitePatientSchema,
  resendInviteSchema
} from "./invitation.schema";
import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";
import { ClinicianRequest } from "../../common/middleware/clinician.middleware";

const invitationService = new InvitationService();

export class InvitationController {

  //  --------------------------------POST /clinician/invite---------------------------------

  async invitePatient(req: Request, res: Response) {
    try {
      const clinicianReq = req as unknown as ClinicianRequest;
      const validated = invitePatientSchema.parse(req.body);

      let targetClinicianId = clinicianReq.clinicianId;
      const role = clinicianReq.user.role;

      if (role === "admin" || role === "super admin") {
        if (!validated.clinician_id) {
          throw new Error("clinician_id is required when an admin invites a patient");
        }
        targetClinicianId = validated.clinician_id;
      } else {
        // Enforce that clinicians can only invite for themselves
        if (!targetClinicianId) {
          throw new Error("Clinician profile not found");
        }
      }

      const result = await invitationService.invitePatient(
        targetClinicianId,
        validated
      );

      await writeAudit(req, {
        action: "PATIENT_INVITED",
        status: "success",
        userId: clinicianReq.user.userId,
        resourceId: result.invite_id,
        resourceType: "invitation",
      });

      return sendSuccess(res, result, 201);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }


//  -------------------------------------POST /clinician/invite/:invite_id/resend---------------------------------------------

  async resendInvite(req: Request, res: Response) {
    try {
      const clinicianReq = req as unknown as ClinicianRequest;
      const invite_id = req.params.invite_id as string;

      const role = clinicianReq.user.role;
      let targetClinicianId: string | undefined = clinicianReq.clinicianId;
      let targetClinicId: string | undefined = clinicianReq.clinicId;

      if (role === "super admin") {
        targetClinicianId = req.query.clinician_id as string;
        targetClinicId = undefined; 
      } else if (role === "admin") {
        targetClinicianId = undefined; 
      } else {
        if (!targetClinicianId) throw new Error("Clinician profile not found");
      }

      const result = await invitationService.resendInvite(
        invite_id,
        targetClinicianId,
        targetClinicId
      );

      await writeAudit(req, {
        action: "INVITE_RESENT",
        status: "success",
        userId: clinicianReq.user.userId,
        resourceId: invite_id,
        resourceType: "invitation",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }


// -------------------------------------------DELETE /clinician/invite/:invite_id-------------------------------------------

  async cancelInvite(req: Request, res: Response) {
    try {
      const clinicianReq = req as unknown as ClinicianRequest;
      const invite_id = req.params.invite_id as string;

      const role = clinicianReq.user.role;
      let targetClinicianId: string | undefined = clinicianReq.clinicianId;
      let targetClinicId: string | undefined = clinicianReq.clinicId;

      if (role === "super admin") {
        targetClinicianId = req.query.clinician_id as string;
        targetClinicId = undefined;
      } else if (role === "admin") {
        targetClinicianId = undefined;
      } else {
        if (!targetClinicianId) throw new Error("Clinician profile not found");
      }

      const result = await invitationService.cancelInvite(
        invite_id,
        targetClinicianId,
        targetClinicId
      );

      await writeAudit(req, {
        action: "INVITE_CANCELLED",
        status: "success",
        userId: clinicianReq.user.userId,
        resourceId: invite_id,
        resourceType: "invitation",
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }
// -------------------------------------------GET /clinician/invite-------------------------------------------

  async getInvitations(req: Request, res: Response) {
    try {
      const clinicianReq = req as unknown as ClinicianRequest;
      const status = req.query.status as string | undefined;

      const role = clinicianReq.user.role;
      let targetClinicianId: string | undefined = clinicianReq.clinicianId;
      let targetClinicId: string | undefined = clinicianReq.clinicId;

      if (role === "super admin") {
        targetClinicianId = req.query.clinician_id as string; 
        targetClinicId = req.query.clinic_id as string; 
      } else if (role === "admin") {
        targetClinicianId = req.query.clinician_id as string;
        
      } else {
        if (!targetClinicianId) throw new Error("Clinician profile not found");
      }

      const result = await invitationService.getInvitations(
        targetClinicianId,
        status,
        targetClinicId
      );

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }
}
