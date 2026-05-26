import { Router } from "express";
import { AuthController } from "./auth.controller";
import { authenticateJWT } from "../../common/middleware/auth.middleware";
import { requireHttps } from "../../common/middleware/https.middleware";

const router = Router();
const authController = new AuthController();

// Standard Auth
router.post("/patient/login", authController.patientLogin.bind(authController));
router.post("/clinician/login", authController.clinicianLogin.bind(authController));
router.post("/refresh", authController.refresh.bind(authController));
router.post("/logout", authController.logout.bind(authController));
router.post("/change-password", authenticateJWT, authController.changePassword.bind(authController));

// Password Reset
router.post("/forgot-password", requireHttps, authController.forgotPassword.bind(authController));
router.post("/reset-password", requireHttps, authController.resetPassword.bind(authController));

// Patient Onboarding
router.post("/invite/verify", requireHttps, (req, res) => authController.verifyInvite(req, res));

router.post("/register", requireHttps, (req, res) => authController.register(req, res));

export default router;
