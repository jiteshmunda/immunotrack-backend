import { Router } from "express";
import { InvitationController } from "./invitation.controller";
import { authenticateJWT, requireRole } from "../../common/middleware/auth.middleware";
import { resolveClinicianProfile } from "../../common/middleware/clinician.middleware";
import { requireHttps } from "../../common/middleware/https.middleware";

const router = Router();
const controller = new InvitationController();


router.post(
  "/clinician/invite",
  requireHttps,
  authenticateJWT,
  requireRole(["clinician"]),
  resolveClinicianProfile,
  (req, res) => controller.invitePatient(req, res)
);

router.get(
  "/clinician/invite",
  requireHttps,
  authenticateJWT,
  requireRole(["clinician"]),
  resolveClinicianProfile,
  (req, res) => controller.getInvitations(req, res)
);


router.post(
  "/clinician/invite/:invite_id/resend",
  requireHttps,
  authenticateJWT,
  requireRole(["clinician"]),
  resolveClinicianProfile,
  (req, res) => controller.resendInvite(req, res)
);


router.delete(
  "/clinician/invite/:invite_id",
  requireHttps,
  authenticateJWT,
  requireRole(["clinician"]),
  resolveClinicianProfile,
  (req, res) => controller.cancelInvite(req, res)
);

export default router;
