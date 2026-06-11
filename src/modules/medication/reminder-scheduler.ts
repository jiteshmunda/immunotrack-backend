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
    // Get the current UTC time
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
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
      daysOfWeek: schema.medicationReminders.daysOfWeek,
      intervalWeeks: schema.medicationReminders.intervalWeeks,
      nextDoseDate: schema.medicationReminders.nextDoseDate,
      timezone: schema.medicationReminders.timezone,
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

  console.log(`[ReminderScheduler] Found ${activeReminders.length} matching reminders at UTC time ${time}. Processing...`);

  const todayStr = now.toISOString().split("T")[0];
  const todayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];
  const processedSet = new Set<string>();

  for (const r of activeReminders) {
    // Prevent duplicate notifications if multiple identical reminders exist in DB
    const uniqueKey = `${r.patientId}_${r.medicationId}_${r.reminderTime}`;
    if (processedSet.has(uniqueKey)) {
      continue;
    }
    processedSet.add(uniqueKey);

    // Weekly / Twice Weekly — only fire on scheduled day(s)
    if (r.daysOfWeek) {
      const scheduledDays = r.daysOfWeek.split(',').map((d: string) => d.trim());
      if (!scheduledDays.includes(todayName)) {
        continue; // not today — skip
      }
    }

    // Biologic — only fire on the actual next dose date
    if (r.intervalWeeks && r.nextDoseDate) {
      if (todayStr !== r.nextDoseDate) {
        continue; // skip — not due today
      }
    }

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

    // Convert the UTC time string back to the patient's local time string
    let localTimeStr = time;
    try {
      const [utcH, utcM] = time.split(':').map(Number);
      
      const nowForTz = new Date();
      const utcString = nowForTz.toLocaleString("en-US", { timeZone: "UTC" });
      const tzString = nowForTz.toLocaleString("en-US", { timeZone: r.timezone || "UTC" });
      const utcDate = new Date(utcString);
      const tzDate = new Date(tzString);
      const offsetMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
      
      let localMinutesTotal = (utcH * 60) + utcM + offsetMinutes;
      while (localMinutesTotal < 0) localMinutesTotal += 24 * 60;
      localMinutesTotal = localMinutesTotal % (24 * 60);
      localTimeStr = `${String(Math.floor(localMinutesTotal / 60)).padStart(2, '0')}:${String(localMinutesTotal % 60).padStart(2, '0')}`;
    } catch (e) {
      console.error("[ReminderScheduler] Error converting UTC to local time for template:", e);
    }

    const template = NotificationTemplates.medication_dose_reminder({
      patientName,
      medName,
      dose: medDose,
      time: localTimeStr
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
