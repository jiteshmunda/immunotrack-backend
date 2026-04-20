import { Router } from "express";
import { ClinicianController } from "./clinician.controller";
import { authenticateJWT, requireRole } from "../../common/middleware/auth.middleware";

const router = Router();
const clinicianController = new ClinicianController();

router.post(
  "/",
  authenticateJWT,
  requireRole(["admin"]),
  clinicianController.create.bind(clinicianController)
);

export default router;
