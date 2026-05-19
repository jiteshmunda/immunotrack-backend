import * as admin from "firebase-admin";
import { db } from "../../db";
import { notifications } from "../../db/schema/compliance.schema";
import { patients } from "../../db/schema/profile.schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { encrypt, decrypt } from "../../utils/encryption";
import { ENV } from "../../config/env";

let fcmInitialized = false;

// ── Initialize Firebase Admin SDK ───────────────────────────────────
if (ENV.FIREBASE_PROJECT_ID && ENV.FIREBASE_CLIENT_EMAIL && ENV.FIREBASE_PRIVATE_KEY) {
  try {
    const privateKey = ENV.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: ENV.FIREBASE_PROJECT_ID,
        clientEmail: ENV.FIREBASE_CLIENT_EMAIL,
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

    // 1. Insert into database notifications (In-App Inbox) - SECURELY ENCRYPTED
    const [inserted] = await db
      .insert(notifications)
      .values({
        userId,
        type,
        title: encrypt(title),
        body: encrypt(body),
      })
      .returning();

    // 2. Fetch the recipient's FCM token from patients (only patients have fcmToken for now)
    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.userId, userId))
      .limit(1);

    const fcmToken = patient?.fcmToken;

    if (!fcmToken) {
      console.log(`[NotificationService] No fcmToken registered for user ${userId}. In-app notification saved, skipping push.`);
      return { success: true, notificationId: inserted.id, pushSent: false, mode: "in-app-only" };
    }

    // 3. Construct HIPAA-Compliant Generic Push Message
    // Public networks like FCM are NOT secure, so we hide specific details unless they are generic reminders
    const safeTitle = "ImmunoTrack Update";
    const safeBody = genericBody || "You have a new update in your dashboard. Tap to view securely.";

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
          },
          apns: {
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
      console.log(`\n🔔 ────── [MOCK PUSH NOTIFICATION DISPATCHED] ──────`);
      console.log(`✉️  Recipient Device Token: ${fcmToken}`);
      console.log(`📌 Public Push Title (HIPAA Safe): ${safeTitle}`);
      console.log(`📌 Public Push Body (HIPAA Safe): ${safeBody}`);
      console.log(`🔒 Secure In-App Title (Encrypted): ${title}`);
      console.log(`🔒 Secure In-App Body (Encrypted): ${body}`);
      console.log(`───────────────────────────────────────────────────\n`);

      return { success: true, notificationId: inserted.id, pushSent: true, mode: "mock" };
    }
  }

  /**
   * Retrieves the notification inbox for a specific user, decrypting all content.
   */
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

      return {
        id: n.id,
        type: n.type,
        title: decryptedTitle,
        body: decryptedBody,
        read_at: n.readAt,
        created_at: n.createdAt,
      };
    });

    return {
      notifications: mapped,
      unread_count: Number(unreadCountResult?.count || 0),
    };
  }

  /**
   * Marks a single notification as read by the user.
   */
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

  /**
   * Marks all notifications as read for a specific user.
   */
  async markAllAsRead(userId: string) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));

    return { success: true };
  }
}
