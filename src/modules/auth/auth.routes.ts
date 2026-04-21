import { Router } from "express";
import { AuthController } from "./auth.controller";
import { authenticateJWT } from "../../common/middleware/auth.middleware";
import { requireHttps } from "../../common/middleware/https.middleware";

const router = Router();
const authController = new AuthController();

// Standard Auth
router.post("/login", authController.login.bind(authController));
router.post("/refresh", authController.refresh.bind(authController));
router.post("/logout", authController.logout.bind(authController));
router.post("/change-password", authenticateJWT, authController.changePassword.bind(authController));

// Patient Onboarding

router.post("/invite/verify", requireHttps, (req, res) => authController.verifyInvite(req, res));

router.post("/register", requireHttps, (req, res) => authController.register(req, res));

export default router;
