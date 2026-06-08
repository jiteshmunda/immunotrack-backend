import { Router } from "express";
import { AuthController } from "./auth.controller";
import { authenticateJWT } from "../../common/middleware/auth.middleware";
import { requireHttps } from "../../common/middleware/https.middleware";

const router = Router();
const authController = new AuthController();

// Standard Auth
router.post("/patient/login", authController.patientLogin.bind(authController));
router.post("/clinician/login", authController.clinicianLogin.bind(authController));
router.post("/verify-mfa", authController.verifyMfa.bind(authController));
router.post("/mfa/setup", (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const jwt = require("jsonwebtoken");
    const { ENV } = require("../../config/env");
    try {
      const decoded = jwt.verify(token, ENV.JWT_SECRET);
      if (decoded.mfaPending) {
        return authController.setupMfa(req, res);
      }
    } catch (err) {}
  }
  authenticateJWT(req, res, next);
}, authController.setupMfa.bind(authController));

router.post("/mfa/enable", (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const jwt = require("jsonwebtoken");
    const { ENV } = require("../../config/env");
    try {
      const decoded = jwt.verify(token, ENV.JWT_SECRET);
      if (decoded.mfaPending) {
        return authController.enableMfa(req, res);
      }
    } catch (err) {}
  }
  authenticateJWT(req, res, next);
}, authController.enableMfa.bind(authController));

router.post("/mfa/challenge", authenticateJWT, authController.mfaChallenge.bind(authController));
router.post("/refresh", authController.refresh.bind(authController));
router.post("/logout", authController.logout.bind(authController));
router.post("/change-password", authenticateJWT, authController.changePassword.bind(authController));

// Email Update (OTP)
router.post("/email/request-otp", authenticateJWT, authController.requestEmailUpdate.bind(authController));
router.post("/email/verify-otp", authenticateJWT, authController.verifyEmailUpdate.bind(authController));

// Password Reset
router.post("/forgot-password", requireHttps, authController.forgotPassword.bind(authController));
router.post("/reset-password", requireHttps, authController.resetPassword.bind(authController));

// Patient Onboarding
router.post("/invite/verify", requireHttps, (req, res) => authController.verifyInvite(req, res));

router.post("/register", requireHttps, (req, res) => authController.register(req, res));

export default router;
