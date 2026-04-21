import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { InvitationService } from "../invitation/invitation.service";
import { loginSchema, refreshSchema, changePasswordSchema } from "./auth.schema";
import { 
  verifyInviteSchema, 
  registerPatientSchema 
} from "../invitation/invitation.schema";
import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";
import { ENV } from "../../config/env";

const authService = new AuthService();
const invitationService = new InvitationService();

export class AuthController {

  // -------------------------------POST /auth/login---------------------------------------
  
  async login(req: Request, res: Response) {
    try {
      const validated = loginSchema.parse(req.body);
      
      const { accessToken, refreshToken, user, resetRequired } = await authService.login(
        validated.email,
        validated.password,
        req.ip,
        req.headers["user-agent"]
      );

      // HIPAA: Set refresh token in HTTP-only cookie
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: ENV.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      await writeAudit(req, {
        action: "LOGIN",
        status: "success",
        userId: user.user_id,
        resourceType: "auth",
      });

      return sendSuccess(res, { accessToken, user, resetRequired });
    } catch (error: any) {
      await writeAudit(req, {
        action: "LOGIN",
        status: "failure",
      });

      return sendError(res, error.message || "Authentication failed", 401);
    }
  }


//  -----------POST /auth/invite/verify — Step 1 of Patient Onboarding--------------------------

  async verifyInvite(req: Request, res: Response) {
    try {
      const validated = verifyInviteSchema.parse(req.body);
      const result = await invitationService.verifyInvite(validated);

      await writeAudit(req, {
        action: "INVITE_VERIFIED",
        status: "success",
        details: { invite_code: validated.invite_code },
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      if (error.message === "RATE_LIMITED") {
        await writeAudit(req, {
          action: "INVITE_VERIFIED",
          status: "failure",
          details: { invite_code: req.body.invite_code, error: "locked" },
        });
        return sendError(res, "Too many attempts. Please wait 1 hour and try again or contact your clinician.", 429);
      }
      return sendError(res, error.message || "Verification failed", 401);
    }
  }


  //  ------------------POST /auth/register — Step 2 of Patient Onboarding-----------------------

  async register(req: Request, res: Response) {
    try {
      const validated = registerPatientSchema.parse(req.body);
      
      const result = await authService.registerPatient(
        validated,
        req.ip,
        req.headers["user-agent"]
      );

      // HIPAA: Set refresh token in HTTP-only cookie
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: ENV.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await writeAudit(req, {
        action: "PATIENT_REGISTERED",
        status: "success",
        userId: result.patient_id,
        resourceType: "patient",
      });

      return sendSuccess(res, { 
        accessToken: result.accessToken, 
        patient_id: result.patient_id,
        onboarding_step: (result as any).onboarding_step 
      }, 201);
    } catch (error: any) {
      return sendError(res, error.message || "Registration failed", 400);
    }
  }

  async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        throw new Error("Refresh token missing");
      }

      const { accessToken, refreshToken: newRefreshToken, user, resetRequired } = await authService.refresh(
        refreshToken,
        req.ip,
        req.headers["user-agent"]
      );

      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: ENV.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await writeAudit(req, {
        action: "REFRESH_TOKEN",
        status: "success",
        userId: user.user_id,
      });

      return sendSuccess(res, { accessToken, resetRequired });
    } catch (error: any) {
      return sendError(res, error.message || "Session expired", 401);
    }
  }

  // ------------------------------- PUT /auth/change-password----------------------------------------

  async changePassword(req: Request, res: Response) {
    try {
      const validated = changePasswordSchema.parse(req.body);
      const userId = (req as any).user.userId;

      await authService.changePassword(userId, validated.currentPassword, validated.newPassword);

      await writeAudit(req, {
        action: "CHANGE_PASSWORD",
        status: "success",
        userId,
      });

      return sendSuccess(res, { message: "Password updated successfully" });
    } catch (error: any) {
      return sendError(res, error.message || "Failed to update password", 400);
    }
  }


  // ----------------------------------POST /auth/logout-----------------------------------------
  async logout(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      res.clearCookie("refreshToken");

      await writeAudit(req, {
        action: "LOGOUT",
        status: "success",
      });

      return sendSuccess(res, { message: "Logged out successfully" });
    } catch (error: any) {
      return sendError(res, "Logout failed", 500);
    }
  }
}
