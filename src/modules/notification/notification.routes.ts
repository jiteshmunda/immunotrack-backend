import { Router } from "express";
import { NotificationController } from "./notification.controller";
import { authenticateJWT } from "../../common/middleware/auth.middleware";

const router = Router();
const notificationController = new NotificationController();

// Secure all notification endpoints
router.use(authenticateJWT);

router.get("/", notificationController.getInbox);
router.patch("/read-all", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);

export default router;
