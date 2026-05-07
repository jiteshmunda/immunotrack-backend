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

export default router;
