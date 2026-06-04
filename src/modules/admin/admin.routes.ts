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

router.post(
  "/system",
  authenticateJWT,
  requireRole(["super admin"]),
  adminController.createSystemAdmin.bind(adminController)
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
  "/analytics",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getAnalytics.bind(adminController)
);

router.get(
  "/analytics/adherence",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getAdherenceAnalytics.bind(adminController)
);

router.get(
  "/analytics/symptoms",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getSymptomAnalytics.bind(adminController)
);

router.get(
  "/analytics/risk-clusters",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getRiskClusterAnalytics.bind(adminController)
);

router.get(
  "/audit-logs",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getAuditLogs.bind(adminController)
);

router.delete(
  "/clinicians/:id",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.deleteClinician.bind(adminController)
);

router.get(
  "/clinicians/:id",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getClinicianDetails.bind(adminController)
);

router.put(
  "/clinicians/:id/role",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.updateClinicianRole.bind(adminController)
);

router.post(
  "/clinicians/transfer-patients",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.transferPatients.bind(adminController)
);

router.get(
  "/clinicians/:id/patients",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getClinicianPatients.bind(adminController)
);

router.get(
  "/users",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getAllUsers.bind(adminController)
);

router.get(
  "/users/:id",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getUserDetails.bind(adminController)
);

router.put(
  "/users/:id/status",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.updateUserStatus.bind(adminController)
);

router.delete(
  "/users/:id",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.deleteUser.bind(adminController)
);

router.get(
  "/patients",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getOrgPatients.bind(adminController)
);

router.get(
  "/patients/:id",
  authenticateJWT,
  requireRole(["admin", "super admin"]),
  adminController.getOrgPatientDetails.bind(adminController)
);

export default router;
