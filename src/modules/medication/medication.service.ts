import { db } from "../../db";
import { medicationCatalog } from "../../db/schema/medication.schema";
import { patientMedications, medicationLogs, medicationReminders, missedMedicationLogs } from "../../db/schema/tracking.schema";
import { patients, clinicians, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { users } from "../../db/schema/user.schema";
import { alerts } from "../../db/schema/ai.schema";
import { eq, and, desc, between, sql, or, inArray } from "drizzle-orm";
import { encrypt, decrypt, hashForLookup } from "../../utils/encryption";
import { LogMedicationInput } from "./medication.validation";
import { calculateAdherenceWindow, formatAdherencePercentage, isPRNMedication, buildChronologicalLogGrid } from "../../utils/adherence";
import { getDailyFrequency } from "../../common/constants/medication";

export interface AddMedicationInput {
  medicationId?: string; // Optional catalog link
  name: string;          // Encrypted in DB
  category: string;      // Required for UI grouping
  dose: string;          // Encrypted in DB
  route?: string;        // Auto-filled from catalog if ID exists
  frequency?: string;    // Auto-filled from catalog if ID exists
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export class MedicationService {

  // ----------------------------------GET /medications/catalog--------------------------------------------------
  async getCatalog() {
    const catalog = await db.select().from(medicationCatalog);

    // Group by category 
    const grouped = catalog.reduce((acc: Record<string, any[]>, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push({
        id: item.id,
        name: item.name,
        genericName: item.genericName,
        brandNames: item.brandNames,
        subCategory: item.subCategory,
        route: item.route,
        standardDose: item.standardDose,
        availableStrengths: item.availableStrengths,
        frequency: item.defaultFrequency,
        clinicalNotes: item.clinicalNotes
      });
      return acc;
    }, {});

    return grouped;
  }

  //  -------------------------------------------- POST /medications---------------------------------------------------------
  async addMedicationToPlan(userId: string, input: AddMedicationInput) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    let finalCategory: string | undefined = input.category;
    let finalRoute = input.route;
    let finalFrequency = input.frequency;

    // Auto-fill from catalog if ID is provided (category & route only, NOT frequency or dose)
    if (input.medicationId) {
      const [catalogItem] = await db.select().from(medicationCatalog)
        .where(eq(medicationCatalog.id, input.medicationId)).limit(1);

      if (catalogItem) {
        finalCategory = finalCategory || catalogItem.category || undefined;
        finalRoute = finalRoute || catalogItem.route || undefined;
      }
    }

    if (!finalCategory || !finalFrequency) {
      throw new Error("CATEGORY_AND_FREQUENCY_REQUIRED");
    }

    // Default start date to today if not provided
    const todayStr = new Date().toISOString().split("T")[0];
    const finalStartDate = input.startDate || todayStr;

    // Short course auto-stop (max 3 days): Automatically compute and set the endDate if not provided
    let finalEndDate = input.endDate;
    if (finalFrequency.toLowerCase().includes("max 3 days")) {
      const start = new Date(finalStartDate);
      start.setDate(start.getDate() + 3);
      finalEndDate = start.toISOString().split("T")[0];
    }

    // Duplicate check
    const nameHash = hashForLookup(input.name);
    const doseHash = hashForLookup(input.dose);

    const [existing] = await db.select()
      .from(patientMedications)
      .where(and(
        eq(patientMedications.patientId, patient.id),
        eq(patientMedications.nameHash, nameHash),
        eq(patientMedications.doseHash, doseHash),
        eq(patientMedications.category, finalCategory),
        eq(patientMedications.frequency, finalFrequency),
        eq(patientMedications.active, true)
      ))
      .limit(1);

    if (existing) {
      throw new Error("MEDICATION_ALREADY_EXISTS_IN_PLAN");
    }

    const [newMed] = await db.insert(patientMedications).values({
      patientId: patient.id,
      medicationId: input.medicationId,
      name: encrypt(input.name),
      nameHash,
      dose: encrypt(input.dose),
      doseHash,
      category: finalCategory as string,
      route: finalRoute || null,
      frequency: finalFrequency as string,
      startDate: finalStartDate,
      endDate: finalEndDate,
      notes: input.notes ? encrypt(input.notes) : null,
      active: true
    }).returning();

    return {
      ...newMed,
      name: input.name,
      dose: input.dose,
      notes: input.notes || null
    };
  }

  // --------------------------------------------------------GET /medications -------------------------------------------------------
  async getMedicationPlan(userId: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const meds = await db.select().from(patientMedications)
      .where(
        eq(patientMedications.patientId, patient.id)
      );

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    return Promise.all(meds.map(async (m) => {
      const freq = m.frequency || "";
      const freqLower = freq.toLowerCase();

      const isWeekly = freqLower.includes("weekly") || freqLower.includes("every week") || freqLower.includes("every 1 week");
      const isBiWeekly = freqLower.includes("every 2 weeks") || freqLower.includes("every 2-4 weeks");
      const isMonthly = freqLower.includes("every 4 weeks") || freqLower.includes("monthly") || freqLower.includes("every month");

      let dosesCount = 1;
      let dosesTaken = 0;
      let dosesMissed = 0;

      if (isWeekly || isBiWeekly || isMonthly) {
        // Low-frequency/Biologics: keep 1/1 until the period closes
        const lookbackDays = isWeekly ? 7 : isBiWeekly ? 14 : 30;
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - lookbackDays);
        windowStart.setHours(0, 0, 0, 0);

        const pastLogs = await db
          .select({ status: medicationLogs.status })
          .from(medicationLogs)
          .where(and(
            eq(medicationLogs.medicationId, m.id),
            sql`${medicationLogs.loggedAt} >= ${windowStart}`
          ));

        const takenInWindow = pastLogs.filter(l => l.status === "taken").length;
        const missedInWindow = pastLogs.filter(l => l.status === "missed").length;
        dosesCount = 1;
        dosesTaken = Math.min(1, takenInWindow);
        dosesMissed = Math.min(1, missedInWindow);
      } else {
        // Standard Daily / Hourly: check logs for today only
        if (freqLower.includes("twice daily") || freqLower.includes("bid")) dosesCount = 2;
        else if (freqLower.includes("three times") || freqLower.includes("tid") || freqLower.includes("3 times")) dosesCount = 3;
        else if (freqLower.includes("four times") || freqLower.includes("qid") || freqLower.includes("4 times") || freqLower.includes("4x daily")) dosesCount = 4;
        else if (freqLower.includes("every 4 hours")) dosesCount = 6;
        else if (freqLower.includes("every 4-6 hours")) dosesCount = 5;
        else if (freqLower.includes("every 6 hours")) dosesCount = 4;
        else if (freqLower.includes("every 8 hours")) dosesCount = 3;
        else if (freqLower.includes("every 12 hours")) dosesCount = 2;
        else if (freqLower.includes("as needed") || freqLower.includes("prn")) dosesCount = 1;

        const todaysLogs = await db
          .select({ status: medicationLogs.status })
          .from(medicationLogs)
          .where(and(
            eq(medicationLogs.medicationId, m.id),
            between(medicationLogs.loggedAt, startOfToday, endOfToday)
          ));

        dosesTaken = todaysLogs.filter(l => l.status === "taken").length;
        dosesMissed = todaysLogs.filter(l => l.status === "missed").length;
      }

      const [reminder] = await db.select({ nextDoseDate: medicationReminders.nextDoseDate })
        .from(medicationReminders)
        .where(eq(medicationReminders.medicationId, m.id))
        .orderBy(medicationReminders.nextDoseDate)
        .limit(1);

      return {
        id: m.id,
        medicationId: m.medicationId,
        category: m.category,
        name: decrypt(m.name),
        dose: decrypt(m.dose),
        route: m.route,
        frequency: m.frequency,
        startDate: m.startDate,
        endDate: m.endDate,
        status: m.deletedAt ? 'deleted' : 'active',
        notes: m.notes ? decrypt(m.notes) : null,
        dosesCount,
        dosesTaken,
        dosesMissed,
        nextDoseDate: reminder?.nextDoseDate || null,
        createdAt: m.createdAt,
        deletedAt: m.deletedAt
      };
    }));
  }
  //
  // -------------------------------------- DELETE /medications/:id ---------------------------------------------------
  async deleteMedicationFromPlan(userId: string, id: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const result = await db.update(patientMedications)
      .set({ active: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(patientMedications.id, id),
        eq(patientMedications.patientId, patient.id)
      )).returning();

    if (result.length === 0) throw new Error("MEDICATION_NOT_FOUND_OR_UNAUTHORIZED");

    await db.delete(medicationReminders)
      .where(eq(medicationReminders.medicationId, id));

    return { success: true, deletedAt: result[0].deletedAt };
  }

  // ---------------------------------- POST /medications/logs ------------------------------------------
  async logMedication(userId: string, input: LogMedicationInput) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const [med] = await db.select().from(patientMedications)
      .where(and(
        eq(patientMedications.id, input.medicationId),
        eq(patientMedications.patientId, patient.id)
      )).limit(1);

    if (!med) throw new Error("MEDICATION_NOT_FOUND_OR_UNAUTHORIZED");

    // Dynamic Daily Log Limit Check
    const dailyFrequency = getDailyFrequency(med.frequency || "");
    if (dailyFrequency > 0 && !isPRNMedication(med.frequency || "")) {
      const maxLogsPerDay = Math.ceil(dailyFrequency);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      // Count existing logs for this medication today
      const [existingLogsToday] = await db.select({
        count: sql<number>`count(*)`
      })
        .from(medicationLogs)
        .where(and(
          eq(medicationLogs.medicationId, med.id),
          between(medicationLogs.loggedAt, startOfToday, endOfToday)
        ));

      const logCount = Number(existingLogsToday?.count || 0);

      if (logCount >= maxLogsPerDay) {
        throw new Error("MAX_DAILY_LOG_LIMIT_EXCEEDED");
      }
    }

    // Multi-Day Interval Overdose Protection for low-frequency medications
    if (input.status === "taken") {
      let minDaysBetweenLogs = 0;
      const f = (med.frequency || "").toLowerCase();

      if (f.includes("weekly") || f.includes("every week")) {
        minDaysBetweenLogs = 5;
      } else if (f.includes("every 2 weeks") || f.includes("every two weeks") || f.includes("every 2-4 weeks")) {
        minDaysBetweenLogs = 10;
      } else if (f.includes("every 4 weeks") || f.includes("every four weeks") || f.includes("monthly")) {
        minDaysBetweenLogs = 20;
      }

      if (minDaysBetweenLogs > 0) {
        // Find the most recent "taken" log for this medication
        const [lastTakenLog] = await db.select()
          .from(medicationLogs)
          .where(and(
            eq(medicationLogs.medicationId, med.id),
            eq(medicationLogs.status, "taken")
          ))
          .orderBy(desc(medicationLogs.loggedAt))
          .limit(1);

        if (lastTakenLog) {
          const msSinceLastLog = Date.now() - new Date(lastTakenLog.loggedAt).getTime();
          const daysSinceLastLog = msSinceLastLog / (1000 * 60 * 60 * 24);

          if (daysSinceLastLog < minDaysBetweenLogs) {
            throw new Error("MEDICATION_LOGGED_TOO_EARLY");
          }
        }
      }
    }

    const log = await db.transaction(async (tx) => {
      const [newLog] = await tx.insert(medicationLogs).values({
        patientId: patient.id,
        medicationId: input.medicationId,
        status: input.status,
        scheduledFor: null,
        takenTime: input.takenTime ? new Date(input.takenTime) : null,
        missedReason: input.missedReason || null,
      }).returning();

      if (input.status === "missed") {
        await tx.insert(missedMedicationLogs).values({
          patientId: patient.id,
          medicationId: input.medicationId,
          reason: input.missedReason || "Manual log",
          missedDate: new Date().toISOString().split("T")[0],
          missedTime: new Date(),
          isAutoGenerated: false,
        });

        // Query the last 3 logs for this medication
        const lastLogs = await tx
          .select()
          .from(medicationLogs)
          .where(eq(medicationLogs.medicationId, input.medicationId))
          .orderBy(desc(medicationLogs.loggedAt))
          .limit(3);

        if (lastLogs.length === 3 && lastLogs.every((l) => l.status === "missed")) {
          const [patientUser] = await tx
            .select({ fullName: users.fullName })
            .from(patients)
            .innerJoin(users, eq(patients.userId, users.id))
            .where(eq(patients.id, patient.id))
            .limit(1);

          const patientName = patientUser?.fullName ? decrypt(patientUser.fullName) : "Patient";
          const medName = decrypt(med.name);

          const [activeAlert] = await tx
            .select()
            .from(alerts)
            .where(
              and(
                eq(alerts.patientId, patient.id),
                eq(alerts.patientMedicationId, med.id),
                eq(alerts.alertType, "medication_non_adherence"),
                eq(alerts.status, "active")
              )
            )
            .limit(1);

          const description = `${patientName} has missed ${medName} for 3 consecutive days.`;

          if (activeAlert) {
            await tx
              .update(alerts)
              .set({
                lastTriggeredAt: new Date(),
                description: encrypt(description),
              })
              .where(eq(alerts.id, activeAlert.id));
          } else {
            await tx.insert(alerts).values({
              patientId: patient.id,
              patientMedicationId: med.id,
              alertType: "medication_non_adherence",
              severity: "High",
              status: "active",
              description: encrypt(description),
              lastTriggeredAt: new Date(),
            });
          }
        }
      }

      return newLog;
    });

    // Check for max-dose warnings for all PRN frequencies
    let warning: string | null = null;
    const freqLower = (med.frequency || "").toLowerCase();

    if (input.status === "taken" && isPRNMedication(med.frequency || "")) {
      let maxDoses = 0;
      let intervalDesc = "";

      if (freqLower.includes("max 3-4") || freqLower.includes("max 3–4") || freqLower.includes("max 3 -4")) {
        maxDoses = 4;
        intervalDesc = "3-4 times daily";
      } else if (freqLower.includes("every 2-4 hours") || freqLower.includes("every 2–4 hours")) {
        maxDoses = 12; // 24 divided by 2
        intervalDesc = "every 2-4 hours (max 12 times daily)";
      } else if (freqLower.includes("every 4-6 hours") || freqLower.includes("every 4–6 hours")) {
        maxDoses = 6; // 24 divided by 4
        intervalDesc = "every 4-6 hours (max 6 times daily)";
      } else if (freqLower.includes("every 6-8 hours") || freqLower.includes("every 6–8 hours")) {
        maxDoses = 4; // 24 divided by 6
        intervalDesc = "every 6-8 hours (max 4 times daily)";
      } else if (freqLower.includes("every 10-12 hours") || freqLower.includes("every 10–12 hours")) {
        maxDoses = 2; // 24 divided by 12
        intervalDesc = "every 10-12 hours (max 2 times daily)";
      } else if (freqLower.includes("as needed") || freqLower.includes("prn")) {
        // Generic PRN warning threshold
        maxDoses = 8;
        intervalDesc = "as needed (general safety threshold of 8 times daily)";
      }

      if (maxDoses > 0) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [takenLogsLast24h] = await db
          .select({ count: sql<number>`count(*)` })
          .from(medicationLogs)
          .where(
            and(
              eq(medicationLogs.medicationId, med.id),
              eq(medicationLogs.status, "taken"),
              sql`${medicationLogs.loggedAt} >= ${twentyFourHoursAgo}`
            )
          );

        const takenCount = Number(takenLogsLast24h?.count || 0);
        if (takenCount > maxDoses) {
          warning = `Warning: You have logged this medication ${takenCount} times in the last 24 hours. The recommended safe limit is ${intervalDesc}.`;
        }
      }
    }

    const [reminder] = await db.select({
      id: medicationReminders.id,
      time: medicationReminders.reminderTime,
      intervalWeeks: medicationReminders.intervalWeeks
    })
      .from(medicationReminders)
      .where(eq(medicationReminders.medicationId, input.medicationId))
      .limit(1);

    if (input.status === "taken" && reminder?.intervalWeeks) {
      const baseDate = input.takenTime ? new Date(input.takenTime) : new Date();
      baseDate.setDate(baseDate.getDate() + (reminder.intervalWeeks * 7));
      const nextDateStr = baseDate.toISOString().split("T")[0];

      await db.update(medicationReminders)
        .set({ nextDoseDate: nextDateStr, updatedAt: new Date() })
        .where(eq(medicationReminders.id, reminder.id));
    }

    return {
      ...log,
      scheduledFor: reminder?.time || null,
      warning
    };
  }

  // ---------------------------------- GET /medications/logs -------------------------------------------
  async getMedicationLogs(userId: string, filters: { startDate?: string, endDate?: string }) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const conditions = [eq(medicationLogs.patientId, patient.id)];

    if (filters.startDate && filters.endDate) {
      conditions.push(between(
        medicationLogs.loggedAt,
        new Date(filters.startDate),
        new Date(filters.endDate)
      ));
    }

    const results = await db.select({
      id: medicationLogs.id,
      status: medicationLogs.status,
      scheduledFor: medicationLogs.scheduledFor,
      takenTime: medicationLogs.takenTime,
      missedReason: medicationLogs.missedReason,
      medicationName: patientMedications.name,
      reminderTime: sql<string>`(SELECT reminder_time FROM medication_reminders WHERE medication_id = ${medicationLogs.medicationId} LIMIT 1)`
    })
      .from(medicationLogs)
      .innerJoin(patientMedications, eq(medicationLogs.medicationId, patientMedications.id))
      .where(and(...conditions))
      .orderBy(desc(medicationLogs.createdAt));

    return results.map(r => ({
      ...r,
      medicationName: decrypt(r.medicationName),
      scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString().split('T')[1].substring(0, 5) : (r.reminderTime || null)
    }));
  }

  // ---------------------------------- POST /medications/reminders -------------------------------------
  async createReminder(userId: string, data: {
    medicationId: string;
    time?: string;
    times?: string[];
    frequency?: string;
    daysOfWeek?: string[];
    dayOfMonth?: number;
    month?: number;
    nextDoseDate?: string;
    intervalWeeks?: number;
  }) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const [medication] = await db.select()
      .from(patientMedications)
      .where(and(
        eq(patientMedications.id, data.medicationId),
        eq(patientMedications.patientId, patient.id)
      ))
      .limit(1);

    if (!medication) throw new Error("MEDICATION_NOT_FOUND_OR_UNAUTHORIZED");

    // PRN Check: Range or PRN frequencies cannot have scheduled reminders
    if (isPRNMedication(medication.frequency || "")) {
      throw new Error("REMINDERS_NOT_ALLOWED_FOR_PRN_OR_RANGE_FREQUENCIES");
    }

    const timesToInsert = data.times && data.times.length > 0 ? data.times : (data.time ? [data.time] : []);
    if (timesToInsert.length === 0) {
      throw new Error("TIME_OR_TIMES_REQUIRED");
    }

    const insertedReminders: any[] = [];
    const daysOfWeekStr = data.daysOfWeek ? data.daysOfWeek.join(",") : null;

    await db.transaction(async (tx) => {
      for (const t of timesToInsert) {
        const [existing] = await tx.select()
          .from(medicationReminders)
          .where(and(
            eq(medicationReminders.medicationId, data.medicationId),
            eq(medicationReminders.reminderTime, t),
            daysOfWeekStr ? eq(medicationReminders.daysOfWeek, daysOfWeekStr) : sql`days_of_week IS NULL`
          ))
          .limit(1);

        if (existing) continue; // Skip duplicates

        const [newReminder] = await tx.insert(medicationReminders)
          .values({
            patientId: patient.id,
            medicationId: data.medicationId,
            reminderTime: t,
            frequency: data.frequency || medication.frequency || "DAILY",
            daysOfWeek: daysOfWeekStr,
            dayOfMonth: data.dayOfMonth || null,
            month: data.month || null,
            nextDoseDate: data.nextDoseDate || null,
            intervalWeeks: data.intervalWeeks || null,
            isEnabled: true,
          })
          .returning();

        insertedReminders.push(newReminder);
      }
    });

    if (insertedReminders.length === 0) {
      throw new Error("REMINDER_ALREADY_EXISTS");
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const hasEnded = medication.endDate && todayStr > medication.endDate;

    const mapped = insertedReminders.map(r => ({
      id: r.id,
      medicationId: r.medicationId,
      medicationName: decrypt(medication.name),
      time: r.reminderTime,
      active: hasEnded ? false : r.isEnabled,
      frequency: r.frequency,
      daysOfWeek: r.daysOfWeek ? r.daysOfWeek.split(",") : null,
      dayOfMonth: r.dayOfMonth,
      month: r.month,
      nextDoseDate: r.nextDoseDate,
      intervalWeeks: r.intervalWeeks,
      hasEnded: !!hasEnded,
    }));

    return mapped.length === 1 ? mapped[0] : mapped;
  }

  // ---------------------------------- GET /medications/reminders --------------------------------------
  async getReminders(userId: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const reminders = await db.select({
      id: medicationReminders.id,
      medicationId: medicationReminders.medicationId,
      medicationName: patientMedications.name,
      time: medicationReminders.reminderTime,
      active: medicationReminders.isEnabled,
      frequency: medicationReminders.frequency,
      daysOfWeek: medicationReminders.daysOfWeek,
      dayOfMonth: medicationReminders.dayOfMonth,
      month: medicationReminders.month,
      nextDoseDate: medicationReminders.nextDoseDate,
      intervalWeeks: medicationReminders.intervalWeeks,
      endDate: patientMedications.endDate,
    })
      .from(medicationReminders)
      .innerJoin(patientMedications, eq(medicationReminders.medicationId, patientMedications.id))
      .where(eq(medicationReminders.patientId, patient.id))
      .orderBy(desc(medicationReminders.createdAt));

    const todayStr = new Date().toISOString().split("T")[0];

    return reminders.map(r => {
      // Dynamic course auto-end check:
      // If medication has an endDate and today is strictly past endDate, the reminder is dynamically inactive.
      const hasEnded = r.endDate && todayStr > r.endDate;
      const isCurrentlyActive = hasEnded ? false : r.active;

      return {
        id: r.id,
        medicationId: r.medicationId,
        medicationName: decrypt(r.medicationName),
        time: r.time,
        active: isCurrentlyActive,
        frequency: r.frequency,
        daysOfWeek: r.daysOfWeek ? r.daysOfWeek.split(",") : null,
        dayOfMonth: r.dayOfMonth,
        month: r.month,
        nextDoseDate: r.nextDoseDate,
        intervalWeeks: r.intervalWeeks,
        hasEnded: !!hasEnded,
      };
    });
  }

  // ---------------------------------- PATCH /medications/reminders/:id --------------------------------
  async updateReminder(userId: string, reminderId: string, data: {
    active?: boolean;
    time?: string;
    daysOfWeek?: string[];
    dayOfMonth?: number;
    month?: number;
    nextDoseDate?: string;
    intervalWeeks?: number;
  }) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const [reminder] = await db.select()
      .from(medicationReminders)
      .where(and(
        eq(medicationReminders.id, reminderId),
        eq(medicationReminders.patientId, patient.id)
      ))
      .limit(1);

    if (!reminder) throw new Error("REMINDER_NOT_FOUND_OR_UNAUTHORIZED");

    const daysOfWeekStr = data.daysOfWeek ? data.daysOfWeek.join(",") : reminder.daysOfWeek;

    if (data.time && (data.time !== reminder.reminderTime || daysOfWeekStr !== reminder.daysOfWeek)) {
      const [existing] = await db.select()
        .from(medicationReminders)
        .where(and(
          eq(medicationReminders.medicationId, reminder.medicationId),
          eq(medicationReminders.reminderTime, data.time),
          daysOfWeekStr ? eq(medicationReminders.daysOfWeek, daysOfWeekStr) : sql`days_of_week IS NULL`
        ))
        .limit(1);

      if (existing) throw new Error("REMINDER_ALREADY_EXISTS");
    }

    const [updated] = await db.update(medicationReminders)
      .set({
        isEnabled: data.active !== undefined ? data.active : reminder.isEnabled,
        reminderTime: data.time || reminder.reminderTime,
        daysOfWeek: daysOfWeekStr,
        dayOfMonth: data.dayOfMonth !== undefined ? data.dayOfMonth : reminder.dayOfMonth,
        month: data.month !== undefined ? data.month : reminder.month,
        nextDoseDate: data.nextDoseDate || reminder.nextDoseDate,
        intervalWeeks: data.intervalWeeks !== undefined ? data.intervalWeeks : reminder.intervalWeeks,
        updatedAt: new Date()
      })
      .where(eq(medicationReminders.id, reminderId))
      .returning();

    const [medication] = await db.select()
      .from(patientMedications)
      .where(eq(patientMedications.id, updated.medicationId))
      .limit(1);

    const todayStr = new Date().toISOString().split("T")[0];
    const hasEnded = medication?.endDate && todayStr > medication.endDate;

    return {
      id: updated.id,
      medicationId: updated.medicationId,
      medicationName: medication ? decrypt(medication.name) : "",
      time: updated.reminderTime,
      active: hasEnded ? false : updated.isEnabled,
      frequency: updated.frequency,
      daysOfWeek: updated.daysOfWeek ? updated.daysOfWeek.split(",") : null,
      dayOfMonth: updated.dayOfMonth,
      month: updated.month,
      nextDoseDate: updated.nextDoseDate,
      intervalWeeks: updated.intervalWeeks,
      hasEnded: !!hasEnded,
    };
  }

  // ---------------------------------- DELETE /medications/reminders/:id -------------------------------
  async deleteReminder(userId: string, reminderId: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const result = await db.delete(medicationReminders)
      .where(and(
        eq(medicationReminders.id, reminderId),
        eq(medicationReminders.patientId, patient.id)
      ))
      .returning();

    if (result.length === 0) throw new Error("REMINDER_NOT_FOUND_OR_UNAUTHORIZED");

    return { success: true };
  }

  // ---------------------------------- GET /medications/adherence --------------------------------------
  async getAdherenceMetrics(userId: string, role: string, patientId?: string, rangeDays?: number, targetDate: Date = new Date()) {
    let targetPatientId: string;

    if (role === "admin" || role === "super admin") {
      if (!patientId) throw new Error("PATIENT_ID_REQUIRED_FOR_ADMIN");
      targetPatientId = patientId;
    } else if (role === "clinician") {
      if (!patientId) throw new Error("PATIENT_ID_REQUIRED_FOR_CLINICIANS");

      const targetClinicians = await db.select({ id: clinicians.id })
        .from(clinicians)
        .where(or(
          eq(clinicians.userId, userId),
          eq(clinicians.createdBy, userId)
        ));

      if (targetClinicians.length === 0) throw new Error("CLINICIAN_NOT_FOUND");
      const clinicianIds = targetClinicians.map(c => c.id);

      const [assignment] = await db.select()
        .from(patientClinicianAssignments)
        .where(and(
          inArray(patientClinicianAssignments.clinicianId, clinicianIds),
          eq(patientClinicianAssignments.patientId, patientId)
        )).limit(1);

      if (!assignment) throw new Error("UNAUTHORIZED_ACCESS_TO_PATIENT_DATA");
      targetPatientId = patientId;
    } else {
      const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
      if (!patient) throw new Error("PATIENT_NOT_FOUND");
      targetPatientId = patient.id;
    }

    const meds = await db.select().from(patientMedications)
      .where(and(
        eq(patientMedications.patientId, targetPatientId),
        eq(patientMedications.active, true)
      ));

    const today = new Date(targetDate);

    const metrics = await Promise.all(meds.map(async (m) => {
      const isPrn = isPRNMedication(m.frequency || "");

      // Calculate Window using common utility
      const { windowStartDate, windowEndDate, totalDays } = calculateAdherenceWindow(
        m.startDate || m.createdAt,
        rangeDays,
        today
      );

      // Query all logs within the overall window
      const overallLogs = await db
        .select({ status: medicationLogs.status })
        .from(medicationLogs)
        .where(and(
          eq(medicationLogs.medicationId, m.id),
          between(
            sql`DATE(${medicationLogs.loggedAt} AT TIME ZONE 'UTC')`,
            windowStartDate.toISOString().split('T')[0],
            windowEndDate.toISOString().split('T')[0]
          )
        ));

      const overallTaken = overallLogs.filter(l => l.status === "taken").length;
      const overallLogged = overallLogs.length;
      const adherencePercentage = !isPrn && overallLogged > 0
        ? formatAdherencePercentage(overallTaken, overallLogged)
        : (isPrn ? null : 0);

      //Calculate 7-day rolling adherence
      const { windowStartDate: start7d, windowEndDate: end7d } = calculateAdherenceWindow(
        m.startDate || m.createdAt,
        7,
        today
      );

      const logs7d = await db
        .select({ status: medicationLogs.status })
        .from(medicationLogs)
        .where(and(
          eq(medicationLogs.medicationId, m.id),
          between(
            sql`DATE(${medicationLogs.loggedAt} AT TIME ZONE 'UTC')`,
            start7d.toISOString().split('T')[0],
            end7d.toISOString().split('T')[0]
          )
        ));

      const taken7d = logs7d.filter(l => l.status === "taken").length;
      const logged7d = logs7d.length;
      const rolling7DayAdherence = !isPrn && logged7d > 0
        ? formatAdherencePercentage(taken7d, logged7d)
        : (isPrn ? null : 0);

      //Formulate PRN usage count text
      let prnUsageText = null;
      if (isPrn) {
        prnUsageText = `Used ${taken7d} times in last 7 days`;
      }

      //Calculate 30-day logs history for the bar chart
      const logs30d = await db
        .select({
          status: medicationLogs.status,
          logDate: sql<string>`DATE(${medicationLogs.loggedAt} AT TIME ZONE 'UTC')`
        })
        .from(medicationLogs)
        .where(and(
          eq(medicationLogs.medicationId, m.id),
          between(
            sql`DATE(${medicationLogs.loggedAt} AT TIME ZONE 'UTC')`,
            new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            today.toISOString().split('T')[0]
          )
        ));

      // Build 30-day chronological array using our clean helper
      const adherenceLogs30Days = buildChronologicalLogGrid(logs30d, today, 30);

      return {
        id: m.id,
        name: decrypt(m.name),
        category: m.category,
        frequency: m.frequency,
        startDate: new Date(m.startDate || m.createdAt).toISOString().split('T')[0],
        isPrn,
        calculationWindow: {
          start: windowStartDate.toISOString().split('T')[0],
          end: windowEndDate.toISOString().split('T')[0],
          totalDays
        },
        daysTaken: overallTaken,
        totalLogged: overallLogged,
        adherencePercentage,
        rolling7DayAdherence,
        prnUsageText,
        adherenceLogs30Days
      };
    }));

    // 4. Calculate Overall Adherence (Average of all active non-PRN medications)
    const nonPrnMeds = metrics.filter(m => !m.isPrn);
    const overallPercentage = nonPrnMeds.length > 0
      ? nonPrnMeds.reduce((acc, m) => acc + (m.adherencePercentage || 0), 0) / nonPrnMeds.length
      : 0;

    const totalTaken = nonPrnMeds.reduce((sum, m) => sum + m.daysTaken, 0);
    const totalDays = nonPrnMeds.reduce((sum, m) => sum + m.calculationWindow.totalDays, 0);
    const totalLogged = nonPrnMeds.reduce((sum, m) => sum + m.totalLogged, 0);

    return {
      overallAdherence: parseFloat(overallPercentage.toFixed(2)),
      rangeDays: rangeDays || "all-time",
      totalTaken,
      totalDays,
      totalLogged,
      medications: metrics
    };
  }

  // ---------------------------------- GET /medications/missed -------------------------------------------
  async getRecentMissedMedications(userId: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const missedLogs = await db.select({
      id: missedMedicationLogs.id,
      medicationId: missedMedicationLogs.medicationId,
      medicationName: patientMedications.name,
      dose: patientMedications.dose,
      reason: missedMedicationLogs.reason,
      missedDate: missedMedicationLogs.missedDate,
      missedTime: missedMedicationLogs.missedTime,
      isAutoGenerated: missedMedicationLogs.isAutoGenerated,
      createdAt: missedMedicationLogs.createdAt
    })
      .from(missedMedicationLogs)
      .innerJoin(patientMedications, eq(missedMedicationLogs.medicationId, patientMedications.id))
      .where(and(
        eq(missedMedicationLogs.patientId, patient.id),
        sql`${missedMedicationLogs.missedTime} >= ${twentyFourHoursAgo}`
      ))
      .orderBy(desc(missedMedicationLogs.missedTime));

    return missedLogs.map(log => ({
      ...log,
      medicationName: decrypt(log.medicationName),
      dose: decrypt(log.dose)
    }));
  }
  // ---------------------------------- PUT /medications/missed/:id/resolve --------------------------------
  async resolveMissedLog(userId: string, missedLogId: string, takenTime: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const [missedLog] = await db.select()
      .from(missedMedicationLogs)
      .where(and(
        eq(missedMedicationLogs.id, missedLogId),
        eq(missedMedicationLogs.patientId, patient.id)
      ))
      .limit(1);

    if (!missedLog) throw new Error("MISSED_LOG_NOT_FOUND_OR_UNAUTHORIZED");

    // Expiration check: Must be within 24 hours
    const msSinceMissed = Date.now() - new Date(missedLog.missedTime).getTime();
    const hoursSinceMissed = msSinceMissed / (1000 * 60 * 60);

    if (hoursSinceMissed > 24) {
      throw new Error("MISSED_LOG_EXPIRED");
    }

    await db.transaction(async (tx) => {
      await tx.delete(missedMedicationLogs).where(eq(missedMedicationLogs.id, missedLogId));

      const startOfDay = new Date(missedLog.missedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(missedLog.missedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const [targetLog] = await tx.select()
        .from(medicationLogs)
        .where(and(
          eq(medicationLogs.patientId, patient.id),
          eq(medicationLogs.medicationId, missedLog.medicationId),
          eq(medicationLogs.status, "missed"),
          between(medicationLogs.loggedAt, startOfDay, endOfDay)
        ))
        .limit(1);

      if (targetLog) {
        await tx.delete(medicationLogs).where(eq(medicationLogs.id, targetLog.id));
      }
    });

    return this.logMedication(userId, {
      medicationId: missedLog.medicationId,
      status: "taken",
      takenTime: takenTime,
    });
  }
}
