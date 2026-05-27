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

      const result = await invitationService.invitePatient(
        clinicianReq.clinicianId,
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

      const result = await invitationService.resendInvite(
        clinicianReq.clinicianId,
        invite_id
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
      return sendError(res, error, 500);
    }
  }


// -------------------------------------------DELETE /clinician/invite/:invite_id-------------------------------------------

  async cancelInvite(req: Request, res: Response) {
    try {
      const clinicianReq = req as unknown as ClinicianRequest;
      const invite_id = req.params.invite_id as string;

      const result = await invitationService.cancelInvite(
        clinicianReq.clinicianId,
        invite_id
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

      const result = await invitationService.getInvitations(
        clinicianReq.clinicianId,
        status
      );

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }
}
