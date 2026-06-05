import { Router } from "express";
import { ClinicianController } from "./clinician.controller";
import { authenticateJWT, requireRole } from "../../common/middleware/auth.middleware";

const router = Router();
const clinicianController = new ClinicianController();

router.post(
  "/",
  authenticateJWT,
  requireRole(["admin", "system_admin"]),
  clinicianController.create.bind(clinicianController)
);

router.get(
  "/profile",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  clinicianController.getProfile.bind(clinicianController)
);

router.put(
  "/profile",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  clinicianController.updateProfile.bind(clinicianController)
);

import { upload } from "../../common/middleware/upload.middleware";

router.post(
  "/profile/photo",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  upload.single("photo"),
  clinicianController.uploadPhoto.bind(clinicianController)
);

router.delete(
  "/profile/photo",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  clinicianController.deletePhoto.bind(clinicianController)
);


router.get(
  "/diagnoses",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  clinicianController.getDiagnoses.bind(clinicianController)
);

router.get(
  "/patients",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  clinicianController.getAssignedPatients.bind(clinicianController)
);

router.post(
  "/patients/:patientId/notes",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  clinicianController.addClinicalNote.bind(clinicianController)
);

router.get(
  "/patients/:patientId/details",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  clinicianController.getPatientDetails.bind(clinicianController)
);

router.get(
  "/analytics",
  authenticateJWT,
  requireRole(["clinician", "admin", "system_admin"]),
  clinicianController.getAnalytics.bind(clinicianController)
);

export default router;
