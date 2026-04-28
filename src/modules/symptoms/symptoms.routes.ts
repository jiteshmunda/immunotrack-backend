import { Router } from "express";
import { SymptomController } from "./symptoms.controller";
import { authenticateJWT } from "../../common/middleware/auth.middleware";

const router = Router();
const controller = new SymptomController();


router.post("/log", authenticateJWT, controller.logSymptoms);

router.get("/history", authenticateJWT, controller.getHistory);

router.get("/history/grouped", authenticateJWT, controller.getGroupedHistory);

export default router;
