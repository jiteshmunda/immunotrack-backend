import { Router } from "express";
import { AlertController } from "./alert.controller";
import { authenticateJWT } from "../../common/middleware/auth.middleware";

const router = Router();
const alertController = new AlertController();

router.use(authenticateJWT);

router.get("/", alertController.getAlerts);
router.patch("/:id/resolve", alertController.resolveAlert);

export default router;
