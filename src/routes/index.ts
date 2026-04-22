import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import clinicianRoutes from "../modules/clinician/clinician.routes";
import invitationRoutes from "../modules/invitation/invitation.routes";
import patientRoutes from "../modules/patient/patient.routes";
import symptomRoutes from "../modules/symptoms/symptoms.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/clinicians", clinicianRoutes);
router.use("/patients", patientRoutes);
router.use("/symptoms", symptomRoutes);
router.use("/", invitationRoutes);

export default router;
