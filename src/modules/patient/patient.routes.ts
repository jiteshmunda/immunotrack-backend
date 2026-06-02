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

import { upload } from "../../common/middleware/upload.middleware";

router.post(
  "/profile/photo",
  authenticateJWT,
  requireRole(["patient"]),
  upload.single("photo"),
  (req, res) => controller.uploadPhoto(req, res)
);

router.delete(
  "/profile/photo",
  authenticateJWT,
  requireRole(["patient"]),
  (req, res) => controller.deletePhoto(req, res)
);

router.get(
  "/dashboard",
  authenticateJWT,
  requireRole(["patient"]),
  (req, res) => controller.getDashboard(req, res)
);


router.post(
  "/consent",
  authenticateJWT,
  requireRole(["patient"]),
  (req, res) => controller.recordConsent(req, res)
);

export default router;
