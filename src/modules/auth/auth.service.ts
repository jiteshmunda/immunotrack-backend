import { db } from "../../db";
import { users } from "../../db/schema/user.schema";
import { userSessions } from "../../db/schema/session.schema";
import { roles } from "../../db/schema/role.schema";
import { patients, patientClinicianAssignments, clinicians } from "../../db/schema/profile.schema";
import { invitations } from "../../db/schema/invitation.schema";
import { onboardingSessions, patientConsents, notifications } from "../../db/schema/compliance.schema";
import { eq, and } from "drizzle-orm";
import { verifyPassword, hashPassword } from "../../utils/hash";
import { hashForLookup, decrypt, encrypt } from "../../utils/encryption";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ENV } from "../../config/env";
import { RegisterPatientInput } from "../invitation/invitation.schema";
import { EmailService } from "../../utils/email";

const emailService = new EmailService();

export class AuthService {

// -----------------POST /auth/login---------------------------

  async login(email: string, password: string, allowedRoles: string[], ip?: string, userAgent?: string) {
    const emailHash = hashForLookup(email);
    const [result] = await db
      .select({
        user: users,
        role: roles,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.emailHash, emailHash))
      .limit(1);

    if (!result) {
      throw new Error("Invalid email or password");
    }

    const { user, role } = result;

    if (!allowedRoles.includes(role.name)) {
      throw new Error("Invalid email or password");
    }

    if (!user.passwordHash) {
      throw new Error("Invalid email or password");
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await db.delete(userSessions).where(eq(userSessions.userId, user.id));

    const rawRefreshToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(rawRefreshToken).digest("hex");
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [session] = await db.insert(userSessions).values([{
      userId: user.id,
      tokenHash,
      ipAddress: ip,
      userAgent: userAgent,
      expiresAt,
    }]).returning();

    const accessToken = generateAccessToken({ 
      userId: user.id, 
      role: role.name,
      sid: session.id 
    });

    const isExpired = user.passwordChangedAt
      ? (new Date().getTime() - user.passwordChangedAt.getTime()) > 60 * 24 * 60 * 60 * 1000
      : false;

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        user_id: user.id,
        role: role.name,
      },
      resetRequired: user.isTempPassword || isExpired,
    };
  }


//  POST ------------------------/auth/register — Step 2 of Patient Onboarding------------------------------------------

  async registerPatient(input: RegisterPatientInput, ip?: string, userAgent?: string) {
    // 1. Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(input.verification_token, ENV.JWT_SECRET);
    } catch (e) {
      throw new Error("INVALID_VERIFICATION_TOKEN");
    }

    const inviteId = decoded.inviteId;

    // 2. Fetch Invite
    const [invite] = await db.select().from(invitations).where(eq(invitations.id, inviteId)).limit(1);
    if (!invite || invite.status !== "pending") {
      throw new Error("INVITE_NOT_FOUND_OR_ALREADY_REDEEMED");
    }

    if (new Date() > invite.expiresAt) {
      throw new Error("INVITE_EXPIRED");
    }

    // 3. Prepare User Data
    const email = decrypt(invite.patientEmail);
    const emailHash = hashForLookup(email);
    const firstName = decrypt(invite.patientFirstName);
    const lastName = decrypt(invite.patientLastName);
    const fullName = `${firstName} ${lastName}`;
    const passwordHash = await hashPassword(input.password);

    const [patientRole] = await db.select().from(roles).where(eq(roles.name, "patient")).limit(1);

    return await db.transaction(async (tx) => {
      // 4. Create User
      const [user] = await tx.insert(users).values([{
        fullName: encrypt(fullName),
        email: encrypt(email),
        emailHash: emailHash,
        passwordHash: passwordHash,
        roleId: patientRole.id,
        status: "active",
      }]).returning();

      // 5. Create Patient Profile
      const [patient] = await tx.insert(patients).values([{
        userId: user.id,
        dateOfBirth: invite.patientDob, // Already encrypted
        primaryDiagnosis: invite.patientDiagnosis,
        icd10QualifyingCode: invite.icd10Code,
        onboardingCompleted: false,
        monitoringActive: false,
      }]).returning();

      // 6. Assignment
      await tx.insert(patientClinicianAssignments).values([{
        patientId: patient.id,
        clinicianId: invite.clinicianId,
        isPrimary: true,
      }]);

      // 7. Update Invite
      await tx.update(invitations)
        .set({ 
          status: "redeemed", 
          redeemedAt: new Date(), 
          redeemedByPatientId: patient.id 
        })
        .where(eq(invitations.id, inviteId));

      // 10. Generate Auth Tokens (Login user immediately)
      const rawRefreshToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(rawRefreshToken).digest("hex");
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const [session] = await tx.insert(userSessions).values([{
        userId: user.id,
        tokenHash,
        ipAddress: ip,
        userAgent: userAgent,
        expiresAt,
      }]).returning();

      const accessToken = generateAccessToken({ 
        userId: user.id, 
        role: "patient",
        sid: session.id 
      });

      return {
        accessToken,
        refreshToken: rawRefreshToken,
        patient_id: patient.id,
        onboarding_step: "consent_platform",
      };
    });
  }

  // POST --------------------------/auth/refresh-----------------------------------
  async refresh(rawRefreshToken: string, ip?: string, userAgent?: string) {
    const tokenHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(rawRefreshToken).digest("hex");
    
    const [session] = await db
      .select()
      .from(userSessions)
      .where(and(eq(userSessions.tokenHash, tokenHash)))
      .limit(1);

    if (!session || session.expiresAt < new Date()) {
      if (session) await db.delete(userSessions).where(eq(userSessions.id, session.id));
      throw new Error("Invalid or expired refresh token");
    }

    const [result] = await db
      .select({
        user: users,
        role: roles,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!result) {
      throw new Error("User associated with session not found");
    }

    const { user, role } = result;

    await db.delete(userSessions).where(eq(userSessions.id, session.id));

    const newRawRefreshToken = crypto.randomBytes(32).toString("hex");
    const newTokenHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(newRawRefreshToken).digest("hex");
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [newSession] = await db.insert(userSessions).values([{
      userId: user.id,
      tokenHash: newTokenHash,
      ipAddress: ip,
      userAgent,
      expiresAt,
    }]).returning();

    const accessToken = generateAccessToken({ 
      userId: user.id, 
      role: role.name,
      sid: newSession.id 
    });

    const isExpired = user.passwordChangedAt
      ? (new Date().getTime() - user.passwordChangedAt.getTime()) > 60 * 24 * 60 * 60 * 1000
      : false;

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      user: {
        user_id: user.id,
        role: role.name,
      },
      resetRequired: user.isTempPassword || isExpired,
    };
  }


  // --------------------------------PUT /auth/change-password------------------------------------------------
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("User not found");
    if (!user.passwordHash) throw new Error("Password not set. Please complete enrollment.");

    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash!);
    if (!isCurrentValid) throw new Error("Current password is incorrect");

    const passwordHash = await hashPassword(newPassword);
    await db.update(users)
      .set({
        passwordHash,
        isTempPassword: false,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }


  // --------------------------------------POST /auth/logout/---------------------------------------------
  async logout(rawRefreshToken: string) {
    const tokenHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(rawRefreshToken).digest("hex");
    await db.delete(userSessions).where(eq(userSessions.tokenHash, tokenHash));
  }

  // ---------------------------------POST /auth/forgot-password-----------------------------------------
  async forgotPassword(email: string) {
    const emailHash = hashForLookup(email);
    const [user] = await db.select().from(users).where(eq(users.emailHash, emailHash)).limit(1);

    // HIPAA: Always return success to prevent email enumeration
    if (!user || user.status !== "active") return;

    // Cooldown check (2 minutes)
    if (user.resetPasswordRequestedAt) {
      const diff = new Date().getTime() - user.resetPasswordRequestedAt.getTime();
      if (diff < 2 * 60 * 1000) {
        throw new Error("Please wait before requesting a new code");
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(otp).digest("hex");
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await db.update(users)
      .set({
        resetPasswordOtp: otpHash,
        resetPasswordExpires: expiresAt,
        resetPasswordAttempts: 0,
        resetPasswordRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await emailService.sendEmail({
      to: email,
      subject: "Your ImmunoTrack Verification Code",
      body: emailService.getOtpTemplate(otp),
    });
  }

  // ---------------------------------POST /auth/reset-password-----------------------------------------
  async resetPassword(email: string, otp: string, newPassword: string) {
    const emailHash = hashForLookup(email);
    
    return await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.emailHash, emailHash)).limit(1);

      if (!user || user.status !== "active") {
        throw new Error("Invalid request");
      }

      if (!user.resetPasswordOtp || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
        throw new Error("Code has expired or is invalid");
      }

      if (user.resetPasswordAttempts >= 5) {
        throw new Error("Too many failed attempts. Please request a new code.");
      }

      const otpHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(otp).digest("hex");
      if (user.resetPasswordOtp !== otpHash) {
        await db.update(users)
          .set({ resetPasswordAttempts: user.resetPasswordAttempts + 1 })
          .where(eq(users.id, user.id));
        
        throw new Error("Invalid verification code");
      }

      // Prevent Password Reuse
      if (user.passwordHash) {
        const isSame = await verifyPassword(newPassword, user.passwordHash);
        if (isSame) {
          throw new Error("New password cannot be the same as your old password");
        }
      }

      const newPasswordHash = await hashPassword(newPassword);

      await tx.update(users)
        .set({
          passwordHash: newPasswordHash,
          isTempPassword: false,
          passwordChangedAt: new Date(),
          resetPasswordOtp: null,
          resetPasswordExpires: null,
          resetPasswordAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Revoke all sessions for security
      await tx.delete(userSessions).where(eq(userSessions.userId, user.id));
    });
  }

  // ---------------------------------POST /auth/email/request-otp-----------------------------------------
  async requestEmailUpdate(userId: string, newEmail: string) {
    const emailHash = hashForLookup(newEmail);
    const [existingUser] = await db.select().from(users).where(eq(users.emailHash, emailHash)).limit(1);

    if (existingUser) {
      if (existingUser.id === userId) {
        throw new Error("New email cannot be the same as current email");
      }
      throw new Error("Email is already taken");
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("User not found");

    if (user.emailUpdateRequestedAt) {
      const diff = new Date().getTime() - user.emailUpdateRequestedAt.getTime();
      if (diff < 2 * 60 * 1000) {
        throw new Error("Please wait before requesting a new code");
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(otp).digest("hex");
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await db.update(users)
      .set({
        pendingEmail: encrypt(newEmail),
        emailUpdateOtp: otpHash,
        emailUpdateExpires: expiresAt,
        emailUpdateAttempts: 0,
        emailUpdateRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await emailService.sendEmail({
      to: newEmail,
      subject: "Your ImmunoTrack Email Update Verification Code",
      body: emailService.getOtpTemplate(
        otp,
        "Email Update Verification",
        "We received a request to update the email address associated with your ImmunoTrack account. Use the verification code below to proceed. This code is valid for 10 minutes.",
        "If you did not request an email change, please ignore this email or contact support immediately."
      ),
    });
  }

  // ---------------------------------POST /auth/email/verify-otp-----------------------------------------
  async verifyEmailUpdate(userId: string, otp: string) {
    return await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      if (!user.emailUpdateOtp || !user.emailUpdateExpires || user.emailUpdateExpires < new Date() || !user.pendingEmail) {
        throw new Error("Code has expired or is invalid");
      }

      if (user.emailUpdateAttempts >= 5) {
        await tx.update(users)
          .set({ 
            emailUpdateOtp: null,
            emailUpdateExpires: null,
            pendingEmail: null,
            emailUpdateAttempts: 0 
          })
          .where(eq(users.id, userId));
        throw new Error("Too many failed attempts. Please request a new code.");
      }

      const otpHash = crypto.createHmac("sha256", ENV.ENCRYPTION_KEY).update(otp).digest("hex");
      if (user.emailUpdateOtp !== otpHash) {
        await tx.update(users)
          .set({ emailUpdateAttempts: user.emailUpdateAttempts + 1 })
          .where(eq(users.id, userId));
        
        throw new Error("Invalid verification code");
      }

      const newEmailDecrypted = decrypt(user.pendingEmail);
      const newEmailHash = hashForLookup(newEmailDecrypted);
      const oldEmailDecrypted = decrypt(user.email);

      await tx.update(users)
        .set({
          email: encrypt(newEmailDecrypted),
          emailHash: newEmailHash,
          pendingEmail: null,
          emailUpdateOtp: null,
          emailUpdateExpires: null,
          emailUpdateAttempts: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
        
      // Send security alert to the old email address (no await to prevent blocking the transaction unnecessarily, though usually fine)
      emailService.sendEmail({
        to: oldEmailDecrypted,
        subject: "Security Alert: Your ImmunoTrack Email Has Been Changed",
        body: emailService.getSecurityNotificationTemplate(
          "Email Address Changed",
          "This is a confirmation that the email address associated with your ImmunoTrack account has been successfully updated."
        ),
      }).catch(err => console.error("Failed to send security alert to old email:", err));
    });
  }
}
