import { db } from "../../db";
import * as schema from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "../../utils/encryption";
import { NotificationService } from "../notification/notification.service";
import { NotificationTemplates } from "../notification/notification.templates";

const notificationService = new NotificationService();

export async function checkAndDispatchReminders(targetTime?: string) {
  const now = new Date();
  let time = targetTime;
  
  if (!time) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    time = `${hours}:${minutes}`;
  }

  // 1. Query active, enabled medication reminders for this specific minute
  const activeReminders = await db
    .select({
      reminderId: schema.medicationReminders.id,
      reminderTime: schema.medicationReminders.reminderTime,
      isEnabled: schema.medicationReminders.isEnabled,
      patientId: schema.medicationReminders.patientId,
      medicationId: schema.medicationReminders.medicationId,
      medName: schema.patientMedications.name,
      medDose: schema.patientMedications.dose,
      medActive: schema.patientMedications.active,
      medEndDate: schema.patientMedications.endDate,
      userId: schema.patients.userId,
      remindersEnabled: schema.patients.medicationRemindersEnabled,
      fullName: schema.users.fullName,
    })
    .from(schema.medicationReminders)
    .innerJoin(schema.patientMedications, eq(schema.medicationReminders.medicationId, schema.patientMedications.id))
    .innerJoin(schema.patients, eq(schema.medicationReminders.patientId, schema.patients.id))
    .innerJoin(schema.users, eq(schema.patients.userId, schema.users.id))
    .where(
      and(
        eq(schema.medicationReminders.reminderTime, time),
        eq(schema.medicationReminders.isEnabled, true),
        eq(schema.patientMedications.active, true),
        eq(schema.patients.medicationRemindersEnabled, true)
      )
    );

  if (activeReminders.length === 0) return;

  console.log(`[ReminderScheduler] Found ${activeReminders.length} matching reminders at local system time ${time}. Processing...`);

  const todayStr = now.toISOString().split("T")[0];

  for (const r of activeReminders) {
    let patientName = "Patient";
    let medName = "Medication";
    let medDose = "prescribed dose";

    try {
      patientName = decrypt(r.fullName) || "Patient";
      medName = decrypt(r.medName) || "Medication";
      medDose = decrypt(r.medDose) || "dose";
    } catch (decErr) {
      console.error("[ReminderScheduler] Decryption failed for reminder:", decErr);
    }

    if (r.medEndDate && todayStr > r.medEndDate) {
      console.log(`[ReminderScheduler]  Skipping "${medName}" for "${patientName}": Medication course ended on ${r.medEndDate}.`);
      continue;
    }

    console.log(`[ReminderScheduler]  Dispatching scheduled alarm for "${patientName}" (${medName})...`);

    const template = NotificationTemplates.medication_dose_reminder({
      patientName,
      medName,
      dose: medDose,
      time
    });

    try {
      const result = await notificationService.sendNotification(
        r.userId,
        "medication_reminder",
        template.title,
        template.body,
        template.pushBody
      );
      console.log(`[ReminderScheduler]  Successfully dispatched notification to ${patientName}:`, JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(`[ReminderScheduler]  Error sending notification to ${patientName}:`, err.message);
    }
  }

  console.log(`[ReminderScheduler] 🏁 Finished processing all reminders for ${time}.\n`);
}

/**
 * Starts the in-memory background loop. Aligns exactly to the top of the next minute for clock precision.
 */
export function startReminderScheduler() {
  console.log("[ReminderScheduler] Initializing background reminder loop (1-minute intervals)...");
  
  const now = new Date();
  const delayToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  
  setTimeout(() => {
    // Run initial tick
    checkAndDispatchReminders().catch(err => {
      console.error("[ReminderScheduler] Error in background reminder execution:", err);
    });

    // Tick exactly every 60 seconds at the top of the minute
    setInterval(() => {
      checkAndDispatchReminders().catch(err => {
        console.error("[ReminderScheduler] Error in background reminder execution:", err);
      });
    }, 60000);

  }, delayToNextMinute);
}
