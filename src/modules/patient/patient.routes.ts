import { Router } from "express";
import { PatientController } from "./patient.controller";
import { authenticateJWT, requireRole } from "../../common/middleware/auth.middleware";

const router = Router();
const controller = new PatientController();


router.get(
  "/profile",
  authenticateJWT,
  requireRole(["patient"]),
  (req, res) => controller.getProfile(req, res)
);

router.put(
  "/profile",
  authenticateJWT,
  requireRole(["patient"]),
  (req, res) => controller.updateProfile(req, res)
);


router.post(
  "/consent",
  authenticateJWT,
  requireRole(["patient"]),
  (req, res) => controller.recordConsent(req, res)
);

export default router;
