import { db } from "../../db";
import { users, passwordHistory } from "../../db/schema/user.schema";
import { userSessions } from "../../db/schema/session.schema";
import { roles } from "../../db/schema/role.schema";
import { patients, patientClinicianAssignments, clinicians } from "../../db/schema/profile.schema";
import { invitations } from "../../db/schema/invitation.schema";
import { onboardingSessions, patientConsents, notifications } from "../../db/schema/compliance.schema";
import { eq, and, desc } from "drizzle-orm";
import { verifyPassword, hashPassword, checkPwnedPassword } from "../../utils/hash";
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
      console.log("Login failed: result not found for emailHash", emailHash);
      throw new Error("Invalid email or password");
    }

    const { user, role } = result;

    if (!allowedRoles.includes(role.name)) {
      console.log("Login failed: role not allowed. Role:", role.name, "Allowed:", allowedRoles);
      throw new Error("Invalid email or password");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      console.log("Login failed: user locked");
      const diffMin = Math.ceil((user.lockedUntil.getTime() - new Date().getTime()) / 60000);
      throw new Error(`Account locked. Please wait ${diffMin} minutes before trying again.`);
    }

    if (!user.passwordHash) {
      console.log("Login failed: no password hash in DB");
      throw new Error("Invalid email or password");
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      console.log("Login failed: password does not match");
      const newAttempts = (user.failedLoginAttempts || 0) + 1;
      let lockedUntil = null;
      
      if (newAttempts === 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
      } else if (newAttempts >= 10) {
        lockedUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hr
      }
      
      await db.update(users)
        .set({ failedLoginAttempts: newAttempts, lockedUntil })
        .where(eq(users.id, user.id));

      if (lockedUntil) {
        const diffMin = Math.ceil((lockedUntil.getTime() - new Date().getTime()) / 60000);
        throw new Error(`Account locked due to too many failed attempts. Please wait ${diffMin} minutes.`);
      }
      throw new Error("Invalid email or password");
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));

    const requiresMfa = user.mfaEnabled;

    if (requiresMfa) {
      // Generate 6-character alphanumeric OTP (uppercase + numbers)
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let otp = "";
      for (let i = 0; i < 6; i++) {
        otp += chars[Math.floor(Math.random() * chars.length)];
      }
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      await db.update(users)
        .set({ loginOtp: otp, loginOtpExpires: expiresAt, loginOtpAttempts: 0 })
        .where(eq(users.id, user.id));

      const userFullName = decrypt(user.fullName);
      const firstName = userFullName.split(" ")[0];
      await emailService.sendLoginMfaEmail(decrypt(user.email), otp, firstName);

      const tempToken = jwt.sign(
        { userId: user.id, role: role.name, mfaPending: true },
        ENV.JWT_SECRET,
        { expiresIn: "15m" }
      );

      return {
        mfaRequired: true,
        tempToken,
        resetRequired: user.isTempPassword,
      };
    }

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

    return {
      mfaRequired: false,
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        user_id: user.id,
        role: role.name,
      },
      resetRequired: user.isTempPassword,
    };
  }

  // -----------------POST /auth/verify-mfa---------------------------

  async verifyMfaLogin(tempToken: string, otp: string, ip?: string, userAgent?: string) {
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, ENV.JWT_SECRET);
    } catch (e) {
      throw new Error("Invalid or expired temporary token");
    }

    if (!decoded.mfaPending) {
      throw new Error("Invalid temporary token");
    }

    const userId = decoded.userId;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("User not found");

    if (!user.loginOtp || !user.loginOtpExpires) {
      throw new Error("MFA not requested or expired");
    }

    if (new Date() > user.loginOtpExpires) {
      throw new Error("OTP has expired. Please log in again.");
    }

    if (user.loginOtpAttempts >= 5) {
      throw new Error("Too many failed attempts. Please log in again.");
    }

    if (user.loginOtp !== otp) {
      await db.update(users)
        .set({ loginOtpAttempts: user.loginOtpAttempts + 1 })
        .where(eq(users.id, user.id));
      throw new Error("Invalid verification code");
    }

    // Clear OTP
    await db.update(users)
      .set({ loginOtp: null, loginOtpExpires: null, loginOtpAttempts: 0 })
      .where(eq(users.id, user.id));

    // Issue tokens
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
      role: decoded.role,
      sid: session.id
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        user_id: user.id,
        role: decoded.role,
      },
      resetRequired: user.isTempPassword,
    };
  }
  async resendMfa(tempToken: string) {
    try {
      const decoded = jwt.verify(tempToken, ENV.JWT_SECRET) as any;
      if (!decoded.mfaPending) {
        throw new Error("Invalid request");
      }

      const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
      if (!user) throw new Error("User not found");

      if (user.loginOtpExpires && (user.loginOtpExpires.getTime() - Date.now() > 9 * 60 * 1000)) {
        throw new Error("RATE_LIMITED");
      }

      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let otp = "";
      for (let i = 0; i < 6; i++) {
        otp += chars[Math.floor(Math.random() * chars.length)];
      }
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      await db.update(users)
        .set({ loginOtp: otp, loginOtpExpires: expiresAt, loginOtpAttempts: 0 })
        .where(eq(users.id, user.id));

      const userFullName = decrypt(user.fullName);
      const firstName = userFullName.split(" ")[0];
      await emailService.sendLoginMfaEmail(decrypt(user.email), otp, firstName);

      return { success: true };
    } catch (err: any) {
      if (err.name === "TokenExpiredError") throw new Error("Invalid or expired token");
      throw err;
    }
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

    const isPwned = await checkPwnedPassword(input.password);
    if (isPwned) throw new Error("Password has appeared in a known data breach. Please choose a stronger password.");

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

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      user: {
        user_id: user.id,
        role: role.name,
      },
      resetRequired: user.isTempPassword,
    };
  }


  // --------------------------------PUT /auth/change-password------------------------------------------------
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const [result] = await db
      .select({ user: users, role: roles })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!result) throw new Error("User not found");
    const { user, role } = result;

    if (role.name !== "patient" && newPassword.length < 12) {
      throw new Error("Password must be at least 12 characters for this role");
    }

    if (!user.passwordHash) throw new Error("Password not set. Please complete enrollment.");

    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash!);
    if (!isCurrentValid) throw new Error("Current password is incorrect");

    // Prevent Password Reuse (Current)
    const isSameAsCurrent = await verifyPassword(newPassword, user.passwordHash);
    if (isSameAsCurrent) throw new Error("Password has been used recently. Please choose a new password.");

    // Prevent Password Reuse (History)
    const recentPasswords = await db.select().from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(5);
      
    for (const history of recentPasswords) {
      const isReused = await verifyPassword(newPassword, history.passwordHash);
      if (isReused) {
        throw new Error("Password has been used recently. Please choose a new password.");
      }
    }

    const isPwned = await checkPwnedPassword(newPassword);
    if (isPwned) throw new Error("Password has appeared in a known data breach. Please choose a stronger password.");

    const passwordHash = await hashPassword(newPassword);
    
    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({
          passwordHash,
          isTempPassword: false,
          passwordChangedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
        
      await tx.insert(passwordHistory).values({
        userId,
        passwordHash,
      });
    });
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
      const [result] = await tx
        .select({ user: users, role: roles })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.emailHash, emailHash))
        .limit(1);

      if (!result || result.user.status !== "active") {
        throw new Error("Invalid request");
      }
      
      const { user, role } = result;

      if (role.name !== "patient" && newPassword.length < 12) {
        throw new Error("Password must be at least 12 characters for this role");
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

      const recentPasswords = await tx.select().from(passwordHistory)
        .where(eq(passwordHistory.userId, user.id))
        .orderBy(desc(passwordHistory.createdAt))
        .limit(5);
        
      for (const history of recentPasswords) {
        const isReused = await verifyPassword(newPassword, history.passwordHash);
        if (isReused) {
          throw new Error("Password has been used recently. Please choose a new password.");
        }
      }

      const isPwned = await checkPwnedPassword(newPassword);
      if (isPwned) throw new Error("Password has appeared in a known data breach. Please choose a stronger password.");

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
        
      await tx.insert(passwordHistory).values({
        userId: user.id,
        passwordHash: newPasswordHash,
      });

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
