import { Request, Response } from "express";
import { ZodError } from "zod";
import { db } from "../../db";
import { clinicians } from "../../db/schema/profile.schema";
import { users } from "../../db/schema/user.schema";
import { eq } from "drizzle-orm";
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
      const parseResult = patientLoginSchema.safeParse(req.body);

      if (!parseResult.success) {
        if (req.body && typeof req.body.email === "string" && typeof req.body.password === "string") {
          try {
            await authService.login(req.body.email, req.body.password, ["patient"], req.ip, req.headers["user-agent"]);
          } catch (err: any) {
            if (err.message.includes("15 minutes") || err.message.includes("Account locked")) {
              throw err; 
            }
          }
        }
        throw parseResult.error;
      }

      const validated = parseResult.data;

      const result = await authService.login(
        validated.email,
        validated.password,
        ["patient"],
        req.ip,
        req.headers["user-agent"]
      );

      if (result.mfaRequired) {
        return sendSuccess(res, { mfaRequired: true, tempToken: result.tempToken });
      }

      // HIPAA: Set refresh token in HTTP-only cookie
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: true, // Required for SameSite="none"
        sameSite: "none", // Required for cross-domain requests
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      await writeAudit(req, {
        action: "PATIENT_LOGIN",
        status: "success",
        userId: result.user?.user_id,
        resourceType: "auth",
      });

      return sendSuccess(res, { accessToken: result.accessToken, user: result.user, resetRequired: result.resetRequired });
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
      const parseResult = clinicianLoginSchema.safeParse(req.body);

      if (!parseResult.success) {
        if (req.body && typeof req.body.email === "string" && typeof req.body.password === "string") {
          try {
            await authService.login(req.body.email, req.body.password, ["clinician", "super admin", "admin"], req.ip, req.headers["user-agent"]);
          } catch (err: any) {
            if (err.message.includes("15 minutes") || err.message.includes("Account locked")) {
              throw err; 
            }
          }
        }
        throw parseResult.error;
      }

      const validated = parseResult.data;

      const result = await authService.login(
        validated.email,
        validated.password,
        ["clinician", "super admin", "admin", "system_admin"],
        req.ip,
        req.headers["user-agent"]
      );

      if (result.mfaRequired) {
        return sendSuccess(res, { 
          mfaRequired: true, 
          mfaSetupRequired: result.mfaSetupRequired,
          tempToken: result.tempToken 
        });
      }

      // HIPAA: Set refresh token in HTTP-only cookie
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      await writeAudit(req, {
        action: "CLINICIAN_LOGIN",
        status: "success",
        userId: result.user?.user_id,
        resourceType: "auth",
      });

      return sendSuccess(res, { accessToken: result.accessToken, user: result.user, resetRequired: result.resetRequired });
    } catch (error: any) {
      await writeAudit(req, {
        action: "CLINICIAN_LOGIN",
        status: "failure",
      });

      return sendError(res, error, 401);
    }
  }


  // -------------------------------POST /auth/verify-mfa---------------------------------------

  async verifyMfa(req: Request, res: Response) {
    try {
      // Need to define verifyMfaSchema in auth.schema.ts
      const { verifyMfaSchema } = require("./auth.schema");
      const validated = verifyMfaSchema.parse(req.body);

      const { accessToken, refreshToken, user, resetRequired } = await authService.verifyMfaLogin(
        validated.tempToken,
        validated.otp,
        req.ip,
        req.headers["user-agent"]
      );

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await writeAudit(req, {
        action: "MFA_VERIFIED",
        status: "success",
        userId: user.user_id,
      });

      return sendSuccess(res, { accessToken, user, resetRequired });
    } catch (error: any) {
      await writeAudit(req, {
        action: "MFA_VERIFIED",
        status: "failure",
      });

      return sendError(res, error, 401);
    }
  }
  async setupMfa(req: Request, res: Response) {
    try {
      let userId: string;
      const { tempToken } = req.body;

      if (tempToken) {
        const jwt = require("jsonwebtoken");
        const { ENV } = require("../../config/env");
        try {
          const decoded = jwt.verify(tempToken, ENV.JWT_SECRET);
          if (!decoded.mfaSetupPending) {
            return sendError(res, new Error("MFA already set up or invalid token"), 400);
          }
          userId = decoded.userId;
        } catch (e) {
          return sendError(res, new Error("Invalid or expired temporary token"), 401);
        }
      } else {
        userId = (req as any).user?.userId;
        if (!userId) {
          return sendError(res, new Error("Unauthorized"), 401);
        }
      }

      const result = await authService.generateMfaSetup(userId);
      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }
  async enableMfa(req: Request, res: Response) {
    try {
      let userId: string;
      const { tempToken, otp } = req.body;

      if (!otp) {
        return sendError(res, new Error("Verification code is required"), 400);
      }

      if (tempToken) {
        const jwt = require("jsonwebtoken");
        const { ENV } = require("../../config/env");
        try {
          const decoded = jwt.verify(tempToken, ENV.JWT_SECRET);
          if (!decoded.mfaSetupPending) {
            return sendError(res, new Error("MFA already set up or invalid token"), 400);
          }
          userId = decoded.userId;
        } catch (e) {
          return sendError(res, new Error("Invalid or expired temporary token"), 401);
        }
      } else {
        userId = (req as any).user?.userId;
        if (!userId) {
          return sendError(res, new Error("Unauthorized"), 401);
        }
      }

      const result = await authService.confirmMfaEnable(
        userId,
        otp,
        req.ip,
        req.headers["user-agent"]
      );

      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await writeAudit(req, {
        action: "MFA_ENABLED",
        status: "success",
        userId: result.user.user_id,
      });

      return sendSuccess(res, {
        accessToken: result.accessToken,
        user: result.user,
        backupCodes: result.backupCodes,
        resetRequired: result.resetRequired
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }
  async mfaChallenge(req: Request, res: Response) {
    try {
      const { mfaChallengeSchema } = require("./auth.schema");
      const validated = mfaChallengeSchema.parse(req.body);
      const userId = (req as any).user.userId;

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !user.passwordHash) {
        return sendError(res, new Error("User not found"), 401);
      }

      const { verifyPassword } = require("../../utils/hash");
      const isValid = await verifyPassword(validated.password, user.passwordHash);
      if (!isValid) {
        return sendError(res, new Error("Invalid password"), 401);
      }

      return sendSuccess(res, { success: true });
    } catch (error: any) {
      return sendError(res, error, 400);
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
        secure: true,
        sameSite: "none",
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
        secure: true,
        sameSite: "none",
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
        details: { error: error.message || "Unknown error" },
      });
      // Fixed: Passing the original error object instead of a string to properly support Zod and mapped errors
      return sendError(res, error, 400);
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
