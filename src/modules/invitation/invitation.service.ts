import { db } from "../../db";
import { clinicians, patients } from "../../db/schema/profile.schema";
import { users } from "../../db/schema/user.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { invitations } from "../../db/schema/invitation.schema";
import { eq, and, sql, inArray, or } from "drizzle-orm";
import { encrypt, hashForLookup, decrypt } from "../../utils/encryption";
import { EmailService } from "../../utils/email";
import crypto from "crypto";
import { 
  InvitePatientInput, 
  VerifyInviteInput,
  ResendInviteInput
} from "./invitation.schema";
import jwt from "jsonwebtoken";
import { ENV } from "../../config/env";

const emailService = new EmailService();

export class InvitationService {
  /**
   * Generates a 12-character alphanumeric code formatted as IMMU-XXXX-XXXX
   */
  private generateInviteCode(): { raw: string; display: string } {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No unambiguous characters (0/O, 1/l/I)
    let randomPart = "";
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(crypto.randomInt(chars.length));
    }
    const raw = `IMMU${randomPart}`;
    const display = `IMMU-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}`;
    return { raw, display };
  }


//  ----------------------------POST /clinician/invite------------------------------------------

  async invitePatient(clinicianId: string, input: InvitePatientInput) {
    // 1. Fetch clinician's details (Join with users for name)
    const [clinician] = await db
      .select({ 
        clinicId: clinicians.clinicId, 
        fullName: users.fullName,
        organizationName: clinicians.organizationName,
        clinicName: clinics.name
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .leftJoin(clinics, eq(clinicians.clinicId, clinics.id))
      .where(eq(clinicians.id, clinicianId))
      .limit(1);

    if (!clinician || !clinician.clinicId) {
      throw new Error("CLINICIAN_OR_CLINIC_NOT_FOUND");
    }

    // 2. Prevent duplicate active invites for the same patient
    const pendingInvites = await db
      .select({ patientEmail: invitations.patientEmail })
      .from(invitations)
      .where(and(eq(invitations.clinicianId, clinicianId), eq(invitations.status, "pending")));
      
    if (pendingInvites.some(inv => decrypt(inv.patientEmail) === input.patient_email)) {
      throw new Error("Patient already has a pending invitation. Please use the resend functionality to generate a fresh code.");
    }

    // Check if user already exists in the system
    const emailHash = hashForLookup(input.patient_email);
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailHash, emailHash))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error("A user with this email address already exists.");
    }

    // 3. Generate secure code
    const { raw, display } = this.generateInviteCode();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    // 3. Encrypt PHI
    const encryptedEmail = encrypt(input.patient_email);
    const encryptedFirstName = encrypt(input.patient_first_name);
    const encryptedLastName = encrypt(input.patient_last_name);
    const encryptedDob = encrypt(input.patient_dob);
    const encryptedDiagnosis = encrypt(input.patient_diagnosis);
    const encryptedIcd10 = input.icd10_code ? encrypt(input.icd10_code) : null;

    return await db.transaction(async (tx) => {
      const [invitation] = await tx
        .insert(invitations)
        .values({
          inviteCode: raw,
          inviteCodeDisplay: display,
          clinicianId: clinicianId,
          clinicId: clinician.clinicId!,
          patientEmail: encryptedEmail,
          patientFirstName: encryptedFirstName,
          patientLastName: encryptedLastName,
          patientDob: encryptedDob,
          patientDiagnosis: encryptedDiagnosis,
          icd10Code: encryptedIcd10,
          rpmEnrolled: String(input.rpm_enrolled),
          personalMessage: input.personal_message?.trim() || undefined,
          status: "pending",
          expiresAt,
        })
        .returning();

      // 5. Send Email
      try {
        const clinicianFullName = clinician.fullName ? decrypt(clinician.fullName) : 'Your Doctor';
        const clinicianFirstName = clinicianFullName.split(' ')[0];
        
        await emailService.sendEmail({
          to: input.patient_email,
          subject: `${clinicianFirstName} at ${clinician.clinicName || 'Your Clinic'} has invited you to join ImmunoTrack`,
          body: emailService.getInviteTemplate(
            input.patient_first_name,
            clinician.fullName ? decrypt(clinician.fullName) : 'Your Doctor',
            clinician.clinicName || 'Your Clinic',
            display,
            raw,
            expiresAt.toISOString(),
            input.personal_message?.trim() || undefined
    )});
        
        await tx.update(invitations).set({ emailSentAt: new Date() }).where(eq(invitations.id, invitation.id));
      } catch (error) {
        console.error("Failed to send invitation email:", error);
      }

      return {
        invite_id: invitation.id,
        invite_code_display: invitation.inviteCodeDisplay,
        expires_at: invitation.expiresAt,
      };
    });
  }


//  ---------------------------------POST /auth/invite/verify-------------------------------------------------

  async verifyInvite(input: VerifyInviteInput) {
    const rawCode = input.invite_code.replace(/-/g, "").toUpperCase();
    
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.inviteCode, rawCode))
      .limit(1);

    if (!invitation) {
      throw new Error("INVALID_CODE");
    }

    // Rate limiting check
    if (invitation.failedAttempts >= 3) {
      const lockDuration = 60 * 60 * 1000; // 1 hour
      const lastAttempt = invitation.redemptionAttemptedAt || invitation.generatedAt;
      if (new Date().getTime() - lastAttempt.getTime() < lockDuration) {
        throw new Error("RATE_LIMITED");
      } else {
        await db.update(invitations).set({ failedAttempts: 0 }).where(eq(invitations.id, invitation.id));
      }
    }

    if (invitation.status !== "pending") {
      throw new Error(invitation.status === "redeemed" ? "ALREADY_USED" : "INVALID_CODE");
    }

    if (new Date() > invitation.expiresAt) {
      await db.update(invitations).set({ status: "expired" }).where(eq(invitations.id, invitation.id));
      throw new Error("EXPIRED");
    }

    // Verify DOB
    const storedDob = decrypt(invitation.patientDob);
    if (storedDob !== input.patient_dob) {
      await db.update(invitations)
        .set({ 
          failedAttempts: invitation.failedAttempts + 1,
          redemptionAttemptedAt: new Date()
        })
        .where(eq(invitations.id, invitation.id));
      throw new Error("DOB_MISMATCH");
    }

    const verificationToken = jwt.sign(
      { inviteId: invitation.id, email: decrypt(invitation.patientEmail) },
      ENV.JWT_SECRET,
      { expiresIn: "30m" }
    );

    const [clinic] = await db.select().from(clinics).where(eq(clinics.id, invitation.clinicId)).limit(1);
    const [clinician] = await db.select({ 
        fullName: users.fullName 
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.id, invitation.clinicianId))
      .limit(1);

    return {
      verification_token: verificationToken,
      patient_first_name: decrypt(invitation.patientFirstName),
      clinic_name: clinic?.name || "Your Clinic",
      clinician_name: clinician?.fullName ? decrypt(clinician.fullName) : "Your Doctor",
      rpm_required: invitation.rpmEnrolled === "true",
    };
  }

// ---------------------------------POST /clinician/invite/:invite_id/resend---------------------------------------

  async resendInvite(inviteId: string, clinicianId?: string, clinicId?: string) {
    let conditions = [eq(invitations.id, inviteId)];
    if (clinicianId) {
      conditions.push(eq(invitations.clinicianId, clinicianId));
    } else if (clinicId) {
      conditions.push(eq(invitations.clinicId, clinicId));
    }

    const [oldInvite] = await db
      .select()
      .from(invitations)
      .where(and(...conditions))
      .limit(1);

    if (!oldInvite) throw new Error("INVITE_NOT_FOUND");
    if (oldInvite.status === "redeemed") throw new Error("ALREADY_REDEEMED");

    // 30-minute cooldown check
    const lastSendTime = oldInvite.lastResentAt || oldInvite.generatedAt;
    const cooldownDuration = 30 * 60 * 1000; // 30 minutes
    if (new Date().getTime() - lastSendTime.getTime() < cooldownDuration) {
      throw new Error("You must wait 30 minutes before resending this invitation.");
    }

    return await db.transaction(async (tx) => {
      const { raw, display } = this.generateInviteCode();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 72);

      const [updatedInvite] = await tx
        .update(invitations)
        .set({
          inviteCode: raw,
          inviteCodeDisplay: display,
          status: "pending",
          expiresAt,
          generatedAt: new Date(),
          emailSentAt: null,
          resendCount: oldInvite.resendCount + 1,
          lastResentAt: new Date(),
          failedAttempts: 0
        })
        .where(eq(invitations.id, inviteId))
        .returning();

      const patientEmail = decrypt(oldInvite.patientEmail);
      const patientFirstName = decrypt(oldInvite.patientFirstName);
      let clinicianInfo = { fullName: "", clinicName: "" };

      if (oldInvite.clinicianId) {
        const [clinician] = await tx.select({ 
            fullName: users.fullName,
            clinicName: clinics.name
          })
          .from(clinicians)
          .innerJoin(users, eq(clinicians.userId, users.id))
          .leftJoin(clinics, eq(clinicians.clinicId, clinics.id))
          .where(eq(clinicians.id, oldInvite.clinicianId))
          .limit(1);
        if (clinician) {
          clinicianInfo.fullName = clinician.fullName ? decrypt(clinician.fullName) : "";
          clinicianInfo.clinicName = clinician.clinicName || "";
        }
      }

      const clinicianFullName = clinicianInfo.fullName || 'Your Doctor';
      const clinicianFirstName = clinicianFullName.split(' ')[0];

      await emailService.sendEmail({
        to: patientEmail,
        subject: `${clinicianFirstName} at ${clinicianInfo.clinicName || 'Your Clinic'} has invited you to join ImmunoTrack`,
        body: emailService.getInviteTemplate(
          patientFirstName,
          clinicianInfo.fullName || 'Your Doctor',
          clinicianInfo.clinicName || 'Your Clinic',
          display,
          raw,
          expiresAt.toISOString(),
          oldInvite.personalMessage?.trim() || undefined
        ),
      });

      return {
        invite_id: updatedInvite.id,
        invite_code_display: display,
        expires_at: expiresAt,
      };
    });
  }


//  --------------------------------------DELETE /clinician/invite/:invite_id------------------------------------------

  async cancelInvite(inviteId: string, clinicianId?: string, clinicId?: string) {
    let conditions = [eq(invitations.id, inviteId)];
    if (clinicianId) {
      conditions.push(eq(invitations.clinicianId, clinicianId));
    } else if (clinicId) {
      conditions.push(eq(invitations.clinicId, clinicId));
    }

    await db.update(invitations)
      .set({ status: "invalidated", invalidatedAt: new Date(), invalidatedReason: "clinician_cancelled" })
      .where(and(...conditions));
    
    return { success: true };
  }
//  --------------------------------------GET /clinician/invite------------------------------------------

  async getInvitations(clinicianId?: string, status?: string, clinicId?: string) {
    let conditions = [];
    if (clinicianId) {
      conditions.push(eq(invitations.clinicianId, clinicianId));
    } else if (clinicId) {
      conditions.push(eq(invitations.clinicId, clinicId));
    }

    if (status) {
      const statuses = status.split(",").map(s => s.trim().toLowerCase());
      const mappedStatuses = statuses.map(s => (s === "accepted" ? "redeemed" : s));
      conditions.push(inArray(invitations.status, mappedStatuses));
    }

    const inviteRecords = await db
      .select({
        invitation: invitations,
        userStatus: users.status
      })
      .from(invitations)
      .leftJoin(patients, eq(invitations.redeemedByPatientId, patients.id))
      .leftJoin(users, eq(patients.userId, users.id))
      .where(
        and(
          ...(conditions.length > 0 ? conditions : []),
          or(
            eq(invitations.status, "pending"),
            and(
              eq(invitations.status, "redeemed"),
              eq(users.status, "onboarding")
            )
          )
        )
      )
      .orderBy(sql`${invitations.createdAt} DESC`);

    return inviteRecords.map(record => {
      const inv = record.invitation;
      let finalStatus = inv.status;

      if (inv.status === "redeemed") {
        if (record.userStatus === "onboarding") {
          finalStatus = "onboarding_in_progress";
        } else {
          finalStatus = "accepted";
        }
      }

      return {
        id: inv.id,
        patient_name: `${decrypt(inv.patientFirstName)} ${decrypt(inv.patientLastName)}`,
        patient_email: decrypt(inv.patientEmail),
        status: finalStatus,
        invite_code: inv.inviteCodeDisplay,
        expires_at: inv.expiresAt,
        created_at: inv.createdAt,
      };
    });
  }
}
