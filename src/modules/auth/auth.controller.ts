import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { InvitationService } from "../invitation/invitation.service";
import { 
  patientLoginSchema,
  clinicianLoginSchema, 
  refreshSchema, 
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  requestEmailUpdateSchema,
  verifyEmailUpdateSchema
} from "./auth.schema";
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
  
  async patientLogin(req: Request, res: Response) {
    try {
      const validated = patientLoginSchema.parse(req.body);
      
      const { accessToken, refreshToken, user, resetRequired } = await authService.login(
        validated.email,
        validated.password,
        ["patient"],
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
        action: "PATIENT_LOGIN",
        status: "success",
        userId: user.user_id,
        resourceType: "auth",
      });

      return sendSuccess(res, { accessToken, user, resetRequired });
    } catch (error: any) {
      await writeAudit(req, {
        action: "PATIENT_LOGIN",
        status: "failure",
      });

      return sendError(res, error, 401);
    }
  }

  // -------------------------------POST /auth/clinician/login---------------------------------------
  
  async clinicianLogin(req: Request, res: Response) {
    try {
      const validated = clinicianLoginSchema.parse(req.body);
      
      const { accessToken, refreshToken, user, resetRequired } = await authService.login(
        validated.email,
        validated.password,
        ["clinician", "admin"],
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
        action: "CLINICIAN_LOGIN",
        status: "success",
        userId: user.user_id,
        resourceType: "auth",
      });

      return sendSuccess(res, { accessToken, user, resetRequired });
    } catch (error: any) {
      await writeAudit(req, {
        action: "CLINICIAN_LOGIN",
        status: "failure",
      });

      return sendError(res, error, 401);
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
      return sendError(res, error, 401);
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
      return sendError(res, error, 400);
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
      return sendError(res, error, 401);
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
      return sendError(res, error, 400);
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
      return sendError(res, error || "Logout failed", 500);
    }
  }

  // -------------------------------POST /auth/forgot-password---------------------------------------
  async forgotPassword(req: Request, res: Response) {
    try {
      const validated = forgotPasswordSchema.parse(req.body);
      
      await authService.forgotPassword(validated.email);

      await writeAudit(req, {
        action: "FORGOT_PASSWORD_REQUESTED",
        status: "success",
      });

      // Generic response for privacy
      return sendSuccess(res, { message: "If an account with that email exists, a verification code has been sent." });
    } catch (error: any) {
      const isRateLimit = error.message === "Please wait before requesting a new code";
      const safeErrorMessage = isRateLimit ? error.message : "An internal error occurred";

      await writeAudit(req, {
        action: "FORGOT_PASSWORD_REQUESTED",
        status: "failure",
        details: { error: safeErrorMessage },
      });
      
      if (isRateLimit) {
        return sendError(res, error, 429);
      }
      return sendSuccess(res, { message: "If an account with that email exists, a verification code has been sent." });
    }
  }

  // -------------------------------POST /auth/reset-password---------------------------------------
  async resetPassword(req: Request, res: Response) {
    try {
      const validated = resetPasswordSchema.parse(req.body);

      await authService.resetPassword(validated.email, validated.otp, validated.newPassword);

      await writeAudit(req, {
        action: "PASSWORD_RESET",
        status: "success",
      });

      return sendSuccess(res, { message: "Password has been reset successfully. Please log in with your new password." });
    } catch (error: any) {
      const safeMessage = (error.message.includes("select") || error.message.includes("Failed query")) 
        ? "Internal database error" 
        : error.message;

      await writeAudit(req, {
        action: "PASSWORD_RESET",
        status: "failure",
        details: { error: safeMessage },
      });
      return sendError(res, safeMessage, 400);
    }
  }

  // -------------------------------POST /auth/email/request-otp---------------------------------------
  async requestEmailUpdate(req: Request, res: Response) {
    try {
      const validated = requestEmailUpdateSchema.parse(req.body);
      const userId = (req as any).user.userId;

      await authService.requestEmailUpdate(userId, validated.newEmail);

      await writeAudit(req, {
        action: "EMAIL_UPDATE_REQUESTED",
        status: "success",
        userId,
      });

      return sendSuccess(res, { message: "If the email is valid, a verification code has been sent." });
    } catch (error: any) {
      await writeAudit(req, {
        action: "EMAIL_UPDATE_REQUESTED",
        status: "failure",
        userId: (req as any).user?.userId,
        details: { error: error.message },
      });

      if (error.message === "Please wait before requesting a new code") {
        return sendError(res, error, 429);
      }
      return sendError(res, error, 400);
    }
  }

  // -------------------------------POST /auth/email/verify-otp---------------------------------------
  async verifyEmailUpdate(req: Request, res: Response) {
    try {
      const validated = verifyEmailUpdateSchema.parse(req.body);
      const userId = (req as any).user.userId;

      await authService.verifyEmailUpdate(userId, validated.otp);

      await writeAudit(req, {
        action: "EMAIL_UPDATE_VERIFIED",
        status: "success",
        userId,
      });

      return sendSuccess(res, { message: "Email has been updated successfully." });
    } catch (error: any) {
      await writeAudit(req, {
        action: "EMAIL_UPDATE_VERIFIED",
        status: "failure",
        userId: (req as any).user?.userId,
        details: { error: error.message },
      });

      return sendError(res, error, 400);
    }
  }
}
