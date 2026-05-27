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

router.get(
  "/profile",
  authenticateJWT,
  requireRole(["clinician"]),
  clinicianController.getProfile.bind(clinicianController)
);

router.put(
  "/profile",
  authenticateJWT,
  requireRole(["clinician"]),
  clinicianController.updateProfile.bind(clinicianController)
);


router.get(
  "/patients",
  authenticateJWT,
  requireRole(["clinician"]),
  clinicianController.getAssignedPatients.bind(clinicianController)
);

router.post(
  "/patients/:patientId/notes",
  authenticateJWT,
  requireRole(["clinician"]),
  clinicianController.addClinicalNote.bind(clinicianController)
);

router.get(
  "/patients/:patientId/details",
  authenticateJWT,
  requireRole(["clinician"]),
  clinicianController.getPatientDetails.bind(clinicianController)
);

router.get(
  "/analytics",
  authenticateJWT,
  requireRole(["clinician"]),
  clinicianController.getAnalytics.bind(clinicianController)
);

export default router;
