import { Router } from "express";
import { AdminController } from "./admin.controller";
import { authenticateJWT, requireRole } from "../../common/middleware/auth.middleware";

const router = Router();
const adminController = new AdminController();

router.post(
  "/",
  authenticateJWT,
  requireRole(["super admin"]),
  adminController.create.bind(adminController)
);

router.get(
  "/clinicians",
  authenticateJWT,
  requireRole(["admin"]),
  adminController.getClinicians.bind(adminController)
);

router.get(
  "/dashboard/population",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getPopulationDashboard.bind(adminController)
);

router.get(
  "/analytics/adherence",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getAdherenceAnalytics.bind(adminController)
);

export default router;
