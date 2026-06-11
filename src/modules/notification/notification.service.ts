import * as admin from "firebase-admin";
import { db } from "../../db";
import { notifications } from "../../db/schema/compliance.schema";
import { patients } from "../../db/schema/profile.schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { encrypt, decrypt } from "../../utils/encryption";
import { ENV } from "../../config/env";

let fcmInitialized = false;

// ── Initialize Firebase Admin SDK ───────────────────────────────────
if (ENV.project_id && ENV.client_email && ENV.private_key) {
  try {
    const privateKey = ENV.private_key.replace(/\\n/g, "\n");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: ENV.project_id,
        clientEmail: ENV.client_email,
        privateKey: privateKey,
      }),
    });
    fcmInitialized = true;
    console.log("[NotificationService] Firebase Admin SDK successfully initialized.");
  } catch (error: any) {
    console.error("[NotificationService] Failed to initialize Firebase Admin SDK:", error.message);
  }
} else {
  console.log("[NotificationService] Firebase credentials not fully configured. Running in Mock Mode.");
}

export class NotificationService {

  /**
   * Sends a push notification and logs it in the database for the secure in-app inbox.
   * Ensures strict HIPAA compliance by removing PHI from public push payloads.
   * 
   * @param userId The recipient's user ID
   * @param type The notification type (e.g. medication_reminder, patient_deterioration, etc.)
   * @param title The secure, encrypted title (visible inside the app)
   * @param body The secure, encrypted body (visible inside the app)
   * @param genericBody Optional generic text to show in the public push notification. Defaults to a HIPAA-safe fallback.
   */
  async sendNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    genericBody?: string
  ) {
    console.log(`[NotificationService] Processing notification of type "${type}" for user: ${userId}`);

    const [inserted] = await db
      .insert(notifications)
      .values({
        userId,
        type,
        title: encrypt(title),
        body: encrypt(body),
      })
      .returning();

    const { users } = await import("../../db/schema/user.schema");
    const { clinicians } = await import("../../db/schema/profile.schema");
    const { EmailService } = await import("../../utils/email");

    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.userId, userId))
      .limit(1);

    const [clinician] = await db
      .select()
      .from(clinicians)
      .where(eq(clinicians.userId, userId))
      .limit(1);

    const fcmToken = patient?.fcmToken || clinician?.fcmToken;

    // Dispatch email if it's a high-priority clinician alert
    if (type === "patient_deterioration") {
      const clinicianWantsEmails = clinician ? clinician.emailNotifications : true;
      if (clinicianWantsEmails) {
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user && user.email) {
          const emailService = new EmailService();
        emailService.sendEmail({
          to: decrypt(user.email),
          subject: "ImmunoTrack Alert: Patient Deterioration",
          body: `
            <h2>Patient Alert</h2>
            <p>One of your patients has reported symptoms indicating a deterioration in their condition.</p>
            <p>Please log in to the ImmunoTrack Clinician Portal immediately to review their latest symptom logs and active alerts.</p>
            <br/>
            <p>Best regards,</p>
            <p><strong>The ImmunoTrack Team</strong></p>
          `
        }).catch(e => console.error("[NotificationService] Failed to send email alert:", e));
        }
      }
    }

    if (!fcmToken) {
      console.log(`[NotificationService] No fcmToken registered for user ${userId}. In-app notification saved, skipping push.`);
      return { success: true, notificationId: inserted.id, pushSent: false, mode: "in-app-only" };
    }

    //HIPAA-Compliant Generic Push Message
    let safeTitle = "ImmunoTrack Update";
    let safeBody = genericBody || "You have a new update in your dashboard. Tap to view securely.";

    if (type === "medication_reminder" || type === "medication_dose_reminder") {
      safeTitle = "Medication Reminder";
      safeBody = "Open the app to view your scheduled reminder.";
    }

    if (fcmInitialized) {
      try {
        const payload: admin.messaging.Message = {
          token: fcmToken,
          notification: {
            title: safeTitle,
            body: safeBody,
          },
          data: {
            notificationId: inserted.id,
            type,
          },
          android: {
            priority: "high",
            notification: {
              channelId: "medication_reminders",
              visibility: "private",
              priority: "max",
            },
          },
          apns: {
            headers: {
              "apns-priority": "10",
            },
            payload: {
              aps: {
                badge: 1,
                sound: "default",
              },
            },
          },
        };

        const response = await admin.messaging().send(payload);
        console.log(`[NotificationService] Push notification successfully delivered via FCM:`, response);
        return { success: true, notificationId: inserted.id, pushSent: true, messageId: response, mode: "fcm" };
      } catch (error: any) {
        console.error(`[NotificationService] Failed to send push via FCM:`, error.message);
        // Do not crash the app/transaction if push provider fails, as the in-app record is safely stored.
        return { success: true, notificationId: inserted.id, pushSent: false, error: error.message, mode: "failed-fcm" };
      }
    } else {
      // Graceful fallback for local development testing
      console.log(`\n ────── [MOCK PUSH NOTIFICATION DISPATCHED] ──────`);
      console.log(` Recipient Device Token: ${fcmToken}`);
      console.log(` Public Push Title (HIPAA Safe): ${safeTitle}`);
      console.log(` Public Push Body (HIPAA Safe): ${safeBody}`);
      console.log(` Secure In-App Title (Encrypted): ${title}`);
      console.log(` Secure In-App Body (Encrypted): ${body}`);
      console.log(` Android Channel: medication_reminders`);
      console.log(` Android Priority: max`);
      console.log(` Android Visibility: private`);
      console.log(` APNs Priority: 10`);
      console.log(`───────────────────────────────────────────────────\n`);

      return { success: true, notificationId: inserted.id, pushSent: true, mode: "mock" };
    }
  }

  // ------------------------------------- POST /api/v1/auth/force-logout ----------------------------------------------
  async sendSilentForceLogout(userId: string) {
    const { patients } = await import("../../db/schema/profile.schema");
    const { clinicians } = await import("../../db/schema/profile.schema");

    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    const [clinician] = await db.select().from(clinicians).where(eq(clinicians.userId, userId)).limit(1);

    const fcmToken = patient?.fcmToken || clinician?.fcmToken;

    if (!fcmToken) return;

    if (fcmInitialized) {
      try {
        const payload: admin.messaging.Message = {
          token: fcmToken,
          data: {
            type: "force_logout",
            reason: "logged_in_elsewhere"
          },
          android: {
            priority: "high"
          },
          apns: {
            payload: {
              aps: {
                contentAvailable: true
              }
            }
          }
        };

        await admin.messaging().send(payload);
        console.log(`[NotificationService] Silent force_logout push sent to ${userId}`);
      } catch (error: any) {
        console.error(`[NotificationService] Failed to send silent force_logout:`, error.message);
      }
    } else {
      console.log(`[NotificationService MOCK] Silent force_logout sent to ${userId}`);
    }
  }

// -------------------------------------GET /api/v1/notifications --------------------------------------------------
  async getInbox(userId: string, limit: number = 20, offset: number = 0) {
    const results = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    // Get count of unread notifications
    const [unreadCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));

    const mapped = results.map(n => {
      let decryptedTitle = "Error decrypting title";
      let decryptedBody = "Error decrypting body";

      try {
        decryptedTitle = decrypt(n.title);
        decryptedBody = decrypt(n.body);
      } catch (err) {
        console.error(`[NotificationService] Decryption failed for notification: ${n.id}`);
      }

      let patientId: string | undefined = undefined;
      if (decryptedBody.includes("||")) {
        const parts = decryptedBody.split("||");
        decryptedBody = parts[0];
        patientId = parts[1];
      }

      let type = n.type;
      if (decryptedTitle === "Patient Enrolled") {
        type = "patient_enrolled";
      }

      return {
        data: {
          title: decryptedTitle,
          body: decryptedBody,
          notificationId: n.id,
          type: type,
          createdAt: n.createdAt,
          readAt: n.readAt,
          patientId: patientId,
        }
      };
    });

    return {
      notifications: mapped,
      unread_count: Number(unreadCountResult?.count || 0),
    };
  }

  // --------------------------------------- PATCH /api/v1/notifications/:id/read -----------------------------------------------------
  async markAsRead(notificationId: string, userId: string) {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .limit(1);

    if (!notification) throw new Error("NOTIFICATION_NOT_FOUND");

    const [updated] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, notificationId))
      .returning();

    return { success: true, read_at: updated.readAt };
  }

  // ------------------------------------------ PATCH /api/v1/notifications/read-all --------------------------------------------------
  async markAllAsRead(userId: string) {
    const now = new Date();
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));

    return { success: true, read_at: now };
  }

// ---------------------------------------------- DELETE /api/v1/notifications/selective --------------------------------------------------
  async deleteSelective(userId: string, ids: string[]) {
    if (!ids.length) return { success: true, deletedAt: new Date() };

    await db
      .delete(notifications)
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)));

    return { success: true, deletedAt: new Date() };
  }

// ---------------------------------------------- DELETE /api/v1/notifications/all --------------------------------------------------------
  async deleteAll(userId: string) {
    await db
      .delete(notifications)
      .where(eq(notifications.userId, userId));

    return { success: true, deletedAt: new Date() };
  }
}
