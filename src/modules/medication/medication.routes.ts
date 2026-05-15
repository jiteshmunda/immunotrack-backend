import { Router } from "express";
import { MedicationController } from "./medication.controller";
import { authenticateJWT, requireRole } from "../../common/middleware/auth.middleware";

const router = Router();
const controller = new MedicationController();

router.use(authenticateJWT);

router.get("/catalog", controller.getCatalog);


router.get("/", requireRole(["patient"]), controller.getMedicationPlan);
router.post("/", requireRole(["patient"]), controller.addMedication);
router.delete("/:id", requireRole(["patient"]), controller.deleteMedication);

router.get("/logs", requireRole(["patient"]), controller.getMedicationLogs);
router.post("/logs", requireRole(["patient"]), controller.logMedication);

router.post("/reminders", requireRole(["patient"]), controller.setReminder);
router.get("/reminders", requireRole(["patient"]), controller.getReminders);
router.patch("/reminders/:id", requireRole(["patient"]), controller.toggleReminder);
router.delete("/reminders/:id", requireRole(["patient"]), controller.deleteReminder);

router.get("/adherence", requireRole(["patient", "clinician"]), controller.getAdherenceMetrics);

export default router;
