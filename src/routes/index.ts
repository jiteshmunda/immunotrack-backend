import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import clinicianRoutes from "../modules/clinician/clinician.routes";
import invitationRoutes from "../modules/invitation/invitation.routes";
import patientRoutes from "../modules/patient/patient.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/clinicians", clinicianRoutes);
router.use("/patients", patientRoutes);
router.use("/", invitationRoutes);

export default router;
